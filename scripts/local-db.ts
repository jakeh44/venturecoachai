/**
 * A local Postgres over TCP for developing against the real driver — no
 * Supabase connection needed.
 *
 *   bun scripts/local-db.ts            # serves Postgres (WASM) on 127.0.0.1:55432
 *   # in another shell:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable' bun scripts/migrate.ts
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55432/postgres?sslmode=disable' bun scripts/db-verify.ts
 *
 * PGlite (@electric-sql/pglite) is Postgres compiled to WASM, and
 * pglite-socket speaks the wire protocol on a real TCP socket, so postgres.js —
 * the driver this app ships — connects to it exactly as it connects to Supabase.
 * That makes this the fastest way to prove a schema change, a new query, or the
 * migration runner works before the owner's database exists. Data lives in
 * memory for the life of the process: restart it and you get a clean database.
 *
 * Dev-only: nothing here is imported by the site.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.PGLITE_PORT ?? 55432);
const host = process.env.PGLITE_HOST ?? "127.0.0.1";

const db = new PGlite();
await db.waitReady;
const server = new PGLiteSocketServer({ db, port, host });
await server.start();

console.log(`local-db: Postgres (PGlite) listening on ${host}:${port}`);
console.log(
  `local-db: DATABASE_URL='postgresql://postgres:postgres@${host}:${port}/postgres?sslmode=disable'`,
);
