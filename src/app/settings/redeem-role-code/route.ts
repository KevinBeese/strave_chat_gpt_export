import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getAuthenticatedAppUserId } from "@/lib/auth";
import { hashAdminCode, matchesBootstrapSuperadminCode } from "@/lib/admin-codes";
import { prisma } from "@/lib/prisma";

const rolePriority: Record<UserRole, number> = {
  USER: 1,
  SUBADMIN: 2,
  SUPERADMIN: 3,
};

function resolveHigherRole(current: UserRole, target: UserRole) {
  return rolePriority[target] > rolePriority[current] ? target : current;
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedAppUserId();
  if (!userId) {
    return NextResponse.redirect(new URL("/auth?next=/settings", request.url), {
      status: 303,
    });
  }

  const formData = await request.formData();
  const rawCodeValue = formData.get("adminCode");
  const adminCode = typeof rawCodeValue === "string" ? rawCodeValue.trim() : "";

  if (!adminCode) {
    return NextResponse.redirect(new URL("/settings?error=missing_admin_code", request.url), {
      status: 303,
    });
  }

  const profile = await prisma.profile.findUnique({
    where: {
      id: userId,
    },
    select: {
      role: true,
    },
  });

  if (!profile) {
    return NextResponse.redirect(new URL("/settings?error=admin_code_failed", request.url), {
      status: 303,
    });
  }

  if (matchesBootstrapSuperadminCode(adminCode)) {
    const superadminCount = await prisma.profile.count({
      where: {
        role: UserRole.SUPERADMIN,
      },
    });
    const canBootstrap = superadminCount === 0 || profile.role === UserRole.SUPERADMIN;

    if (!canBootstrap) {
      return NextResponse.redirect(new URL("/settings?error=bootstrap_code_disabled", request.url), {
        status: 303,
      });
    }

    await prisma.profile.update({
      where: {
        id: userId,
      },
      data: {
        role: UserRole.SUPERADMIN,
      },
    });

    return NextResponse.redirect(new URL("/settings?role_upgraded=SUPERADMIN", request.url), {
      status: 303,
    });
  }

  const codeHash = hashAdminCode(adminCode);
  const now = new Date();

  const inviteCode = await prisma.adminInviteCode.findUnique({
    where: {
      codeHash,
    },
    select: {
      id: true,
      targetRole: true,
      maxUses: true,
      usedCount: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!inviteCode) {
    return NextResponse.redirect(new URL("/settings?error=invalid_admin_code", request.url), {
      status: 303,
    });
  }

  if (inviteCode.revokedAt) {
    return NextResponse.redirect(new URL("/settings?error=admin_code_revoked", request.url), {
      status: 303,
    });
  }

  if (inviteCode.expiresAt && inviteCode.expiresAt.getTime() <= now.getTime()) {
    return NextResponse.redirect(new URL("/settings?error=admin_code_expired", request.url), {
      status: 303,
    });
  }

  if (inviteCode.usedCount >= inviteCode.maxUses) {
    return NextResponse.redirect(new URL("/settings?error=admin_code_used_up", request.url), {
      status: 303,
    });
  }

  const elevatedRole = resolveHigherRole(profile.role, inviteCode.targetRole);

  const updateResult = await prisma.adminInviteCode.updateMany({
    where: {
      id: inviteCode.id,
      revokedAt: null,
      usedCount: {
        lt: inviteCode.maxUses,
      },
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: now,
          },
        },
      ],
    },
    data: {
      usedCount: {
        increment: 1,
      },
      usedByUserId: userId,
    },
  });

  if (updateResult.count === 0) {
    return NextResponse.redirect(new URL("/settings?error=admin_code_unavailable", request.url), {
      status: 303,
    });
  }

  await prisma.profile.update({
    where: {
      id: userId,
    },
    data: {
      role: elevatedRole,
    },
  });

  return NextResponse.redirect(new URL(`/settings?role_upgraded=${elevatedRole}`, request.url), {
    status: 303,
  });
}
