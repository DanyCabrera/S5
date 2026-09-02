import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "schema.sql",
);

export async function applySchema(pool: Pool): Promise<void> {
  const sql = await readFile(schemaPath, "utf8");
  await pool.query(sql);
}
