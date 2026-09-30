/**
 * Migration runner — applies pending migrations in src/server/db/migrations/.
 *
 *   bun scripts/migrate.ts
 *
 * Behavior (same CLI contract as before the driver swap):
 * - Resolves DATABASE_URL and exits with a clear message when it is unset
 *   (the app must build/serve before a database is connected).
 * - Ensures schema_migrations exists, then applies every migration whose
 *   `name` isn't recorded yet.
 * - Each migration is ONE transaction on one connection: every DDL statement in
 *   its `up` array plus its schema_migrations bookkeeping row commit together.
 *   Postgres DDL is transactional, so a failure halfway through leaves the
 *   schema exactly as it was and the migration stays pending for a re-run.
 * - Safe to re-run: up-to-date runs report "up to date" and do nothing.
 *
 * Migration modules export { name, up: string[] } (see 001_init.ts). The `up`
 * entries are plain DDL strings written in the repo (never user input), so they
 * go through `unsafe()` and reach the server byte-identical to the source file.
 */
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sql } from "~/db";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "migrate: DATABASE_URL is not set — nothing to migrate against.\n" +
      "Save the Postgres/Supabase connection string (database card), then run:\n" +
      "  bun scripts/migrate.ts",
  );
  process.exit(1);
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "server", "db", "migrations");

let appliedCount = 0;
try {
  // Bookkeeping table first, so a fresh database is self-describing.
  await sql()`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const appliedRows = await sql()`select name from schema_migrations`;
  const applied = new Set(appliedRows.map((row) => String(row.name ?? "")));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".ts"))
    .sort();

  for (const file of files) {
    const mod = (await import(pathToFileURL(join(MIGRATIONS_DIR, file)).href)) as {
      name?: string;
      up?: string[];
    };
    const name = mod.name ?? file;
    if (applied.has(name)) continue;
    const up: string[] = Array.isArray(mod.up) ? mod.up : [];
    if (up.length === 0) {
      console.error(`migrate: ${file} exports no non-empty \`up\` array — refusing to run.`);
      process.exit(1);
    }
    // The whole migration + its bookkeeping row in one transaction.
    await sql.begin(async (tx) => {
      for (const statement of up) {
        await tx.unsafe(statement);
      }
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    console.log(`applied ${name} (${up.length} statements)`);
    appliedCount += 1;
  }
} catch (error) {
  console.error(`migrate: failed — ${error instanceof Error ? error.message : String(error)}`);
  await sql.end();
  process.exit(1);
}

if (appliedCount === 0) {
  console.log("migrate: up to date (no pending migrations)");
} else {
  console.log(`migrate: applied ${appliedCount} migration(s)`);
}

await sql.end();
process.exit(0);
