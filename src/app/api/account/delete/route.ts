import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getAuthenticatedAppProfile } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { disconnectStravaConnectionWithDeauthorize } from "@/lib/strava";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { disconnectWahooConnectionWithDeauthorize } from "@/lib/wahoo";

export async function POST(request: Request) {
  try {
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
    const targetUserIdEntry = formData.get("targetUserId");
    const targetUserId = typeof targetUserIdEntry === "string" ? targetUserIdEntry : profile.id;

    if (!targetUserId) {
      return NextResponse.redirect(new URL("/settings?error=missing_target_user", request.url), {
        status: 303,
      });
    }

    const targetProfile = await prisma.profile.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!targetProfile) {
      return NextResponse.redirect(new URL("/settings?error=user_not_found", request.url), {
        status: 303,
      });
    }

    if (targetProfile.role === UserRole.SUPERADMIN && targetProfile.id !== profile.id) {
      return NextResponse.redirect(new URL("/settings?error=cannot_delete_superadmin", request.url), {
        status: 303,
      });
    }

    await Promise.all([
      disconnectStravaConnectionWithDeauthorize(targetUserId),
      disconnectWahooConnectionWithDeauthorize(targetUserId),
    ]);

    await prisma.profile.delete({
      where: {
        id: targetUserId,
      },
    });

    if (targetUserId === profile.id) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();

      return NextResponse.redirect(new URL("/auth?account_deleted=1", request.url), {
        status: 303,
      });
    }

    return NextResponse.redirect(new URL("/settings?account_deleted=1", request.url), {
      status: 303,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown account delete error";
    const isSchemaMissing = /P2021|table .* does not exist/i.test(message);
    const errorCode = isSchemaMissing ? "db_schema_missing" : "account_delete_failed";

    return NextResponse.redirect(new URL(`/settings?error=${errorCode}`, request.url), {
      status: 303,
    });
  }
}
