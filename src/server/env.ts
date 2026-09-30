/**
 * Environment helpers — server-only.
 *
 * All of these are safe to call before a database is connected: they never
 * touch the network, they only read process.env. Use `dbAvailable()` to guard
 * every query path so the app builds and serves without DATABASE_URL.
 */

/** True when the team database connection string is present. */
export function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Read a required environment variable, throwing a clear error if missing. */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * True when running a production build/serve (vite build + `bun run start`).
 * Prod-specific behavior that needs the request context (e.g. cookie Secure
 * behind the HTTPS proxy) lives in session.ts — keep this module pure.
 */
export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}