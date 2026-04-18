import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { generateAdminInviteCodeValue, hashAdminCode } from "@/lib/admin-codes";
import { getAuthenticatedAppProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export async function POST(request: Request) {
  const profile = await getAuthenticatedAppProfile();
  if (!profile) {
    return NextResponse.redirect(new URL("/auth?next=/settings", request.url), {
      status: 303,
    });
  }

  if (profile.role !== UserRole.SUPERADMIN) {
    return NextResponse.redirect(new URL("/settings?error=admin_only", request.url), {
      status: 303,
    });
  }

  const formData = await request.formData();
  const targetRoleValue = formData.get("targetRole");
  const targetRole =
    targetRoleValue === UserRole.SUPERADMIN ? UserRole.SUPERADMIN : UserRole.SUBADMIN;

  const maxUses = parsePositiveInt(formData.get("maxUses"), 1, 1, 100);
  const expiresInHours = parsePositiveInt(formData.get("expiresInHours"), 24, 1, 24 * 30);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const generatedCode = generateAdminInviteCodeValue();
  const codeHash = hashAdminCode(generatedCode);

  await prisma.adminInviteCode.create({
    data: {
      codeHash,
      targetRole,
      maxUses,
      expiresAt,
      createdByUserId: profile.id,
    },
  });

  const params = new URLSearchParams({
    admin_code_created: "1",
    new_admin_code: generatedCode,
    new_admin_role: targetRole,
    new_admin_max_uses: String(maxUses),
  });

  return NextResponse.redirect(new URL(`/settings?${params.toString()}`, request.url), {
    status: 303,
  });
}
