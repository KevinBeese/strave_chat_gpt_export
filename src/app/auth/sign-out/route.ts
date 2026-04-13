import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.redirect(new URL("/auth?error=signout_failed", request.url), {
      status: 303,
    });
  }

  return NextResponse.redirect(new URL("/auth?signed_out=1", request.url), { status: 303 });
}
