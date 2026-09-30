/**
 * src/db.ts — server-only Postgres handle (standard Postgres, e.g. Supabase).
 *
 * Driver: postgres.js (npm `postgres`) — a direct wire-protocol Postgres client.
 * The connection string comes from `DATABASE_URL`: a Supabase connection string
 * (transaction pooler on :6543 or direct on :5432) or any other Postgres URL.
 * It is injected into the sandbox and passed to the live host on publish.
 *
 * The exported `sql` keeps the call shape every call site already uses — no
 * call site changed for the driver swap:
 *
 *   const rows = await sql()`select id, title, created_at from posts`;
 *   const one  = await sql()`select * from users where id = ${userId}`;
 *   const made = await sql()`insert into t (a) values (${a}) returning id`;
 *
 * `sql()` resolves the (lazily created, per-URL memoized) client and returns its
 * tagged-template query function. `sql.unsafe`, `sql.array`, `sql.begin` and
 * `sql.transaction` are forwarded to that same client for raw SQL, typed array
 * parameters, and multi-statement transactions.
 *
 * Nothing here touches the network at import time, and resolving the client
 * throws a clear error when `DATABASE_URL` is unset — so the site still builds
 * and serves (with db:"unavailable" on /api/health) before a database exists.
 *
 * Use it only inside a `createServerFn()` handler, an `src/routes/api/*` route,
 * or a CLI script (never client code).
 *
 * Serialization note: like the Neon driver it replaces, postgres.js returns
 * `timestamptz` as a JS `Date`. React refuses to render Dates and server
 * functions only carry plain JSON, so rows crossing to the client still go
 * through `~/server/serialize` (`dateToString` / `serializeRow(s)`).
 */
import postgres from "postgres";

/** The client type shared by app code, scripts and tests (postgres.js client). */
export type Db = postgres.Sql;

/** A transaction handle — what `sql.begin`/`sql.transaction` callbacks receive. */
export type Tx = postgres.TransactionSql;

/** The error every query path throws when no database is connected yet. */
export const DATABASE_URL_MISSING =
  "DATABASE_URL is not set — save the Postgres/Supabase connection string (via the database card) before running queries.";

/** Max pool size per process; override with DATABASE_POOL_MAX. */
function poolMax(): number {
  const raw = Number(process.env.DATABASE_POOL_MAX);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

/** Parse the connection string, tolerating anything that isn't a URL. */
function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * True for a Supabase pgbouncer endpoint: the transaction pooler listens on
 * 6543, and every pooler host is `*.pooler.supabase.com`.
 */
function isPooler(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const port = parsed.port ? Number(parsed.port) : 5432;
  return port === 6543 || parsed.hostname.includes("pooler.");
}

/** True for a local/loopback host (dev database — no TLS expected). */
function isLoopback(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(parsed.hostname);
}

/** True when the connection string already states its TLS mode. */
function hasSslMode(url: string): boolean {
  const parsed = parseUrl(url);
  return Boolean(parsed?.searchParams.has("sslmode"));
}

/**
 * JSON (`jsonb`) parameter handling — the one place where a driver swap changes
 * semantics rather than just the client library.
 *
 * Every call site in this codebase hands JSON *text* to a `jsonb` column:
 *
 *   ${JSON.stringify(write.profile)}::jsonb
 *
 * postgres.js's built-in serializer for the json types is `JSON.stringify`, and
 * the server tells it the parameter is jsonb, so that pre-serialized text gets
 * stringified *again* — the column then holds a JSON string (`"{\"a\":1}"`)
 * instead of an object (`{"a":1}`), and reads come back as strings where every
 * caller expects an object. Accepting either an already-serialized string (pass
 * it through — the `::jsonb` cast parses it) or a plain JS value (stringify it)
 * keeps all existing call sites working, and fixes the round-trip.
 */
const JSON_TYPES: Record<string, postgres.PostgresType> = {
  json: {
    to: 114,
    from: [114, 3802],
    serialize: (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value)),
    parse: (raw: string) => JSON.parse(raw) as unknown,
  },
};

/**
 * Connection options derived from the connection string:
 *
 * - TLS: an explicit `sslmode=` in the URL wins (postgres.js reads it itself).
 *   Otherwise TLS is required for every non-loopback host, which Supabase
 *   always is. `ssl: 'require'` encrypts without pinning a CA — Supabase's
 *   pooler certificate chain is not in Node's trust store, so 'verify-full'
 *   would fail on a connection that is otherwise perfectly good.
 * - `prepare: false` for a pooler endpoint. pgbouncer in transaction mode
 *   cannot keep server-side prepared statements, and postgres.js prepares by
 *   default, so leaving it on produces intermittent
 *   `prepared statement "..." already exists` failures once two requests share
 *   a backend. Direct (non-pooled) connections keep prepared statements, which
 *   is faster.
 * - A small pool: the site is a single long-lived process, and its connections
 *   are cheap either way behind the pooler. `idle_timeout`/`connect_timeout`
 *   keep a dead network from hanging a request forever.
 * - `onnotice` is silenced: DDL like `create table if not exists` would
 *   otherwise spam the server log with NOTICEs.
 */
export function connectionOptions(url: string): postgres.Options<Record<string, postgres.PostgresType>> {
  const options: postgres.Options<Record<string, postgres.PostgresType>> = {
    max: poolMax(),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: !isPooler(url),
    onnotice: () => {},
    types: JSON_TYPES,
  };
  if (!hasSslMode(url) && !isLoopback(url)) options.ssl = "require";
  return options;
}

let cached: { url: string; client: Db } | null = null;

/**
 * Resolve the database client, creating it on first use and memoizing it per
 * connection string. Throws `DATABASE_URL_MISSING` when nothing is configured,
 * so the failure is a clear message instead of a driver-level connect error.
 */
export function getClient(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(DATABASE_URL_MISSING);
  if (cached?.url === url) return cached.client;
  const previous = cached;
  cached = null;
  if (previous) void previous.client.end({ timeout: 5 }).catch(() => {});
  const client = postgres(url, connectionOptions(url));
  cached = { url, client };
  return client;
}

/** True when a connection string is present (no network touch). */
export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Close the pool. CLI scripts call this; the server keeps it open for life. */
export async function endDb(): Promise<void> {
  const current = cached;
  cached = null;
  if (!current) return;
  try {
    await current.client.end({ timeout: 5 });
  } catch {
    // Already closed / connection lost — nothing left to release.
  }
}

/**
 * One step of a `sql.transaction([...])` batch: a raw SQL string (run with
 * `unsafe`, no parameters) or a callback that receives the transaction client
 * and returns its query, e.g.
 *
 *   sql.transaction([
 *     "create table if not exists t (id uuid primary key)",
 *     (tx) => tx`insert into t (id) values (${id})`,
 *   ]);
 */
export type TransactionStep<T = unknown> = string | ((tx: Tx) => T | Promise<T>);

/**
 * Run steps as one transaction: either a callback (`sql.begin`-style, postgres.js
 * idiom) or an array of `TransactionStep`s, which is the array-shaped API the
 * migration runner and signup insert were written against.
 *
 * Everything runs on ONE connection: if any step throws, the transaction rolls
 * back and nothing is committed.
 */
export async function transaction<T = unknown>(
  steps: readonly TransactionStep<T>[] | ((tx: Tx) => T | Promise<T>),
): Promise<unknown> {
  const client = getClient();
  return client.begin(async (tx) => {
    if (typeof steps === "function") return steps(tx);
    const results: unknown[] = [];
    for (const step of steps) {
      results.push(typeof step === "string" ? await tx.unsafe(step) : await step(tx));
    }
    return results;
  });
}

/**
 * The database handle. Call it with no arguments to get the tagged-template
 * client (see the file header), or use the forwarded helpers below.
 */
export const sql = Object.assign(
  (): Db => getClient(),
  {
    /** Run `cb` inside a transaction on one connection in the pool. */
    begin: <T>(cb: (tx: Tx) => T | Promise<T>) => getClient().begin(cb),
    /** Array-shaped transaction helper (see `TransactionStep`). */
    transaction,
    /** Raw SQL, unchanged, with the same parameterization as `unsafe()`. */
    unsafe: <T extends any[] = postgres.Row[]>(query: string, parameters: any[] = []) =>
      getClient().unsafe<T>(query, parameters),
    /** Postgres array parameter helper (`sql.array([...], oid)`). */
    array: (value: any, type?: number) => getClient().array(value, type),
    /** True when DATABASE_URL is set. */
    configured: dbConfigured,
    /** Close the pool (scripts). */
    end: endDb,
  },
);
