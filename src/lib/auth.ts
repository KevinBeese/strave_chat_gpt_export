import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";

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

export async function ensureAppUserExists(userId: string, email?: string | null) {
  await prisma.profile.upsert({
    where: { id: userId },
    update: {
      email: email ?? "",
    },
    create: {
      id: userId,
      email: email ?? "",
    },
  });
}

export type AuthenticatedAppProfile = {
  id: string;
  email: string;
  role: UserRole;
};

export async function requireAuthenticatedUser() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    redirect(AUTH_ROUTE);
  }

  return user;
}

export async function requireAppUserId() {
  const user = await requireAuthenticatedUser();
  await ensureAppUserExists(user.id, user.email);
  return user.id;
}

export async function getAuthenticatedAppUserId() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    return null;
  }

  await ensureAppUserExists(user.id, user.email);
  return user.id;
}

export async function getAuthenticatedAppProfile() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    return null;
  }

  await ensureAppUserExists(user.id, user.email);
  const profile = await prisma.profile.findUnique({
    where: {
      id: user.id,
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (!profile) {
    return null;
  }

  return profile satisfies AuthenticatedAppProfile;
}
