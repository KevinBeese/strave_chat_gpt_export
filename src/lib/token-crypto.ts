import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getEnv } from "@/lib/env";

const TOKEN_PREFIX = "enc:v1:";
const AES_ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
  const env = getEnv();
  return createHash("sha256").update(env.SESSION_SECRET, "utf8").digest();
}

export function isEncryptedToken(value: string) {
  return value.startsWith(TOKEN_PREFIX);
}

export function encryptToken(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = createCipheriv(AES_ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64url");

  return `${TOKEN_PREFIX}${payload}`;
}

export function decryptToken(value: string) {
  if (!isEncryptedToken(value)) {
    return {
      token: value,
      wasEncrypted: false,
    };
  }

  const encodedPayload = value.slice(TOKEN_PREFIX.length);
  const payload = Buffer.from(encodedPayload, "base64url");

  if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Stored token payload is malformed.");
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = getEncryptionKey();
  const decipher = createDecipheriv(AES_ALGO, key, iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return {
    token: decrypted.toString("utf8"),
    wasEncrypted: true,
  };
}
