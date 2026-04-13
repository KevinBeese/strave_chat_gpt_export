import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const AUTH_ROUTE = "/auth";

export async function getCurrentSupabaseUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function ensureAppUserExists(userId: string) {
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId },
  });
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    redirect(AUTH_ROUTE);
  }

  return user;
}

export async function requireAppUserId() {
  const user = await requireAuthenticatedUser();
  await ensureAppUserExists(user.id);
  return user.id;
}

export async function getAuthenticatedAppUserId() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    return null;
  }

  await ensureAppUserExists(user.id);
  return user.id;
}
