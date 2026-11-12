import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unstable_noStore as noStore } from "next/cache";
import type { Database } from "@/lib/food-cost/types";

// Runtime path, so Next does not trace it. The image copies this file into a
// data directory the server user can write: writeDb creates a temp file beside
// it. See the Dockerfile and outputFileTracingIncludes.
const file = path.join(process.cwd(), "data", "food-cost.json");

export function readDb(): Database {
  noStore();
  return JSON.parse(readFileSync(file, "utf8")) as Database;
}

export function writeDb(db: Database) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`);
  renameSync(tmp, file);
}
