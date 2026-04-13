import { randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = "app_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_REFRESH_WINDOW_SECONDS = 60 * 60 * 24 * 7;

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

function shouldRefreshSession(expiresAt: Date) {
  return expiresAt.getTime() - Date.now() < SESSION_REFRESH_WINDOW_SECONDS * 1000;
}

function setSessionCookie(value: string) {
  return cookies().then((cookieStore) => {
    cookieStore.set(SESSION_COOKIE_NAME, value, getSessionCookieOptions());
  });
}

export function setSessionCookieOnResponse(response: NextResponse, value: string) {
  response.cookies.set(SESSION_COOKIE_NAME, value, getSessionCookieOptions());
}

type UserSessionResult = {
  userId: string;
  sessionToken: string;
  shouldSetCookie: boolean;
};

export async function getOrCreateCurrentUserSession(): Promise<UserSessionResult> {
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

        return {
          userId: session.userId,
          sessionToken,
          shouldSetCookie: true,
        };
      }

      return {
        userId: session.userId,
        sessionToken,
        shouldSetCookie: false,
      };
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

  const user = await prisma.profile.create({
    data: {
      id: randomUUID(),
    },
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

  return {
    userId: user.id,
    sessionToken: newSessionToken,
    shouldSetCookie: true,
  };
}

export async function getOrCreateCurrentUserId() {
  const session = await getOrCreateCurrentUserSession();
  if (session.shouldSetCookie) {
    await setSessionCookie(session.sessionToken);
  }

  return session.userId;
}
