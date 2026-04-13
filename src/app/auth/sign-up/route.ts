import { NextResponse } from "next/server";

import { ensureAppUserExists } from "@/lib/auth";
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
  const nextPath = getSafeNextPath(formData.get("next"));

  if (!email || !password) {
    return NextResponse.redirect(
      new URL(`/auth?error=missing_credentials&next=${encodeURIComponent(nextPath)}`, request.url),
      { status: 303 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth?error=signup_failed&next=${encodeURIComponent(nextPath)}`, request.url),
      { status: 303 },
    );
  }

  if (data.user) {
    await ensureAppUserExists(data.user.id);
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
