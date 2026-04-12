import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = "app_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_REFRESH_WINDOW_SECONDS = 60 * 60 * 24 * 7;

function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

function shouldRefreshSession(expiresAt: Date) {
  return expiresAt.getTime() - Date.now() < SESSION_REFRESH_WINDOW_SECONDS * 1000;
}

function setSessionCookie(value: string) {
  return cookies().then((cookieStore) => {
    cookieStore.set(SESSION_COOKIE_NAME, value, {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  });
}

export async function getOrCreateCurrentUserId() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    const session = await prisma.userSession.findUnique({
      where: {
        sessionToken,
      },
      select: {
        userId: true,
        expiresAt: true,
      },
    });

    if (session && session.expiresAt.getTime() > Date.now()) {
      if (shouldRefreshSession(session.expiresAt)) {
        const refreshedExpiry = getSessionExpiryDate();
        await prisma.userSession.update({
          where: {
            sessionToken,
          },
          data: {
            expiresAt: refreshedExpiry,
          },
        });
        await setSessionCookie(sessionToken);
      }

      return session.userId;
    }

    if (session) {
      await prisma.userSession.delete({
        where: {
          sessionToken,
        },
      });
    }

    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  const user = await prisma.user.create({
    data: {},
    select: {
      id: true,
    },
  });
  const newSessionToken = randomBytes(32).toString("hex");
  await prisma.userSession.create({
    data: {
      sessionToken: newSessionToken,
      userId: user.id,
      expiresAt: getSessionExpiryDate(),
    },
  });
  await setSessionCookie(newSessionToken);

  return user.id;
}
