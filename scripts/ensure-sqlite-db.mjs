import { mkdirSync, openSync, closeSync } from "node:fs";
import { dirname } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";

if (!databaseUrl.startsWith("file:")) {
  console.error(`Unsupported DATABASE_URL for bootstrap: ${databaseUrl}`);
  process.exit(1);
}

const relativePath = databaseUrl.slice("file:".length);
const resolvedPath = relativePath.startsWith("/")
  ? relativePath
  : new URL(`../prisma/${relativePath.replace(/^\.\//, "")}`, import.meta.url).pathname;

mkdirSync(dirname(resolvedPath), { recursive: true });
const handle = openSync(resolvedPath, "a");
closeSync(handle);

console.log(`SQLite database ready at ${resolvedPath}`);
