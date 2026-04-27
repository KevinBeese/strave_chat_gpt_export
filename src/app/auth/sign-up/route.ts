import { NextResponse } from "next/server";

import { ensureAppUserExists } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getSafeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/dashboard";
  }

  return value;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")).trim() : "";
  const password =
    typeof formData.get("password") === "string" ? String(formData.get("password")) : "";
  const displayNameEntry = formData.get("displayName");
  const displayName =
    typeof displayNameEntry === "string" ? displayNameEntry.trim().slice(0, 80) : "";
  const nextPath = getSafeNextPath(formData.get("next"));

  if (!email || !password || !displayName) {
    return NextResponse.redirect(
      new URL(`/auth?error=missing_credentials&next=${encodeURIComponent(nextPath)}`, request.url),
      { status: 303 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    const reason = encodeURIComponent(error.code ?? error.message ?? "unknown_signup_error");
    console.error("Supabase sign-up failed", {
      code: error.code,
      message: error.message,
      status: error.status,
    });
    return NextResponse.redirect(
      new URL(
        `/auth?error=signup_failed&reason=${reason}&next=${encodeURIComponent(nextPath)}`,
        request.url,
      ),
      { status: 303 },
    );
  }

  if (data.user) {
    await ensureAppUserExists(data.user.id, data.user.email);
    await prisma.profile.update({
      where: { id: data.user.id },
      data: {
        displayName,
      },
    });
  }

  if (!data.session) {
    return NextResponse.redirect(
      new URL(`/auth?error=account_created_check_email&next=${encodeURIComponent(nextPath)}`, request.url),
      { status: 303 },
    );
  }

  return NextResponse.redirect(new URL(`${nextPath}?auth=account_created`, request.url), {
    status: 303,
  });
}
