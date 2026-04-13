import { NextResponse } from "next/server";

import { requireAppUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const userId = await requireAppUserId();
  const formData = await request.formData();
  const rawDisplayName = typeof formData.get("displayName") === "string" ? formData.get("displayName") : "";
  const displayName = rawDisplayName.trim().slice(0, 80);

  await prisma.profile.update({
    where: { id: userId },
    data: {
      displayName: displayName.length > 0 ? displayName : null,
    },
  });

  return NextResponse.redirect(new URL("/settings?profile_updated=1", request.url), {
    status: 303,
  });
}
