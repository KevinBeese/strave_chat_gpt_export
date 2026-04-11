import { beforeEach, describe, expect, it } from "vitest";

import { decryptToken, encryptToken, isEncryptedToken } from "@/lib/token-crypto";

describe("token-crypto", () => {
  beforeEach(() => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "file:./dev.db";
    process.env.SESSION_SECRET = "test-session-secret-1234567890";
    process.env.STRAVA_CLIENT_ID = "client";
    process.env.STRAVA_CLIENT_SECRET = "secret";
    process.env.STRAVA_REDIRECT_URI = "http://localhost:3000/api/strava/callback";
  });

  it("encrypts and decrypts token values", () => {
    const raw = "my-access-token";
    const encrypted = encryptToken(raw);

    expect(encrypted).not.toBe(raw);
    expect(isEncryptedToken(encrypted)).toBe(true);

    const decrypted = decryptToken(encrypted);
    expect(decrypted.token).toBe(raw);
    expect(decrypted.wasEncrypted).toBe(true);
  });

  it("supports legacy plaintext values for migration", () => {
    const legacy = decryptToken("legacy-plain-token");

    expect(legacy.token).toBe("legacy-plain-token");
    expect(legacy.wasEncrypted).toBe(false);
  });
});
