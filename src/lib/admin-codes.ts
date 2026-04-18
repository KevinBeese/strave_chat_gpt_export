import { createHash, randomBytes } from "node:crypto";

const CODE_LENGTH = 16;
const CODE_GROUP_SIZE = 4;

function normalizeCode(rawCode: string) {
  return rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashAdminCode(rawCode: string) {
  const normalized = normalizeCode(rawCode);
  const pepper = process.env.ADMIN_CODE_HASH_PEPPER ?? "";
  return createHash("sha256").update(`${pepper}:${normalized}`).digest("hex");
}

export function matchesBootstrapSuperadminCode(rawCode: string) {
  const configured = process.env.SUPERADMIN_BOOTSTRAP_CODE;
  if (!configured) {
    return false;
  }

  return normalizeCode(rawCode) === normalizeCode(configured);
}

export function generateAdminInviteCodeValue() {
  const raw = randomBytes(16).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normalized = raw.slice(0, CODE_LENGTH).padEnd(CODE_LENGTH, "X");
  const grouped = normalized.match(new RegExp(`.{1,${CODE_GROUP_SIZE}}`, "g")) ?? [normalized];
  return grouped.join("-");
}
