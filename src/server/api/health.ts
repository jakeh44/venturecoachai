/**
 * Health check payload.
 *
 * Why this lives outside src/routes/: this TanStack Start version (1.168) has
 * no createServerFileRoute, and route loaders cannot emit raw Response bodies
 * (the loader pipeline only special-cases redirects/notFound). The production
 * server (serve.ts) special-cases GET /api/health and returns this JSON.
 */
import { dbAvailable } from "../env";

export interface HealthPayload {
  ok: true;
  db: "ok" | "unavailable";
  ts: string;
}

export function healthPayload(): HealthPayload {
  return {
    ok: true,
    db: dbAvailable() ? "ok" : "unavailable",
    ts: new Date().toISOString(),
  };
}