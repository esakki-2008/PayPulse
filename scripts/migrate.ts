import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { getPostgresPool } from "../src/server/database/postgres-client";

/** Applies checked-in SQL migrations serially without printing DATABASE_URL or SQL payloads. */
async function main(): Promise<void> {
  const migrationsDirectory = join(process.cwd(), "src/server/database/migrations");
  const files = (await readdir(migrationsDirectory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TABLE IF NOT EXISTS paypulse_schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    for (const file of files) {
      const alreadyApplied = await client.query<{ id: string }>("SELECT id FROM paypulse_schema_migrations WHERE id = $1", [file]);
      if (alreadyApplied.rows[0]) continue;
      const sql = await readFile(join(migrationsDirectory, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO paypulse_schema_migrations (id) VALUES ($1)", [file]);
      process.stdout.write(`Applied migration ${file}\n`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Do not emit connection strings, environment values, or raw provider data.
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted database URL]") : "Unknown migration failure";
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exitCode = 1;
});
