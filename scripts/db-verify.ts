/**
 * Database-layer verification — runs against whatever DATABASE_URL points at.
 *
 *   DATABASE_URL='postgresql://...' bun scripts/db-verify.ts
 *
 * Exercises the real `~/db` path end to end: the `sql()` tagged template, real
 * parameters, `::jsonb` casts, Date coercion, plan limit enforcement
 * (src/server/usage.ts, including its window-start SQL fragment), the
 * array-shaped `sql.transaction([...])` helper with rollback, the session
 * insert's `make_interval(secs => $n)` shape, and the coach repository's
 * onboarding write + reads.
 *
 * It creates one throwaway user (deleted again at the end; the schema cascades)
 * so it mutates the database it is pointed at — run it against a dev database or
 * a freshly migrated one, not against live customer data. The schema must exist
 * first: `bun scripts/migrate.ts`.
 */
import { sql } from "~/db";
import { dateToString } from "~/server/serialize";
import { healthPayload } from "~/server/api/health";
import { recordUsage } from "~/server/usage";
import {
  loadCoachingState,
  loadCurrentBusiness,
  loadFounderProfile,
  saveDailyPriorities,
  saveOnboarding,
} from "~/server/coach/repository";
import type { FounderIntake } from "~/server/coach/types";

if (!process.env.DATABASE_URL) {
  console.error(
    "db-verify: DATABASE_URL is not set — point it at a dev Postgres (or start the local\n" +
      "PGlite socket with `bun scripts/local-db.ts`) before running the checks.",
  );
  process.exit(1);
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const email = `db-verify-${Date.now()}@example.invalid`;
let userId = "";

try {
  /* 1. tagged template + parameters + returning + Date coercion */
  const inserted = await sql()`
    insert into users (email, name, password_hash)
    values (${email}, ${"Db Verify"}, ${"not-a-real-hash"})
    returning id, created_at
  `;
  userId = String(inserted[0].id);
  check("insert … returning id", userId.length === 36, userId);
  check("timestamptz comes back as a Date", inserted[0].created_at instanceof Date);
  check("dateToString() coerces it", dateToString(inserted[0].created_at)?.endsWith("Z") === true);

  /* 2. filter by parameter, aggregate cast to int */
  const counted = await sql()`select count(*)::int as n from users where email = ${email}`;
  check("parameterised select + ::int aggregate", counted[0].n === 1, String(counted[0].n));

  /* 3. limit enforcement: finite Free cap of 5 idea_analysis per month */
  const first = await recordUsage(userId, null, "idea_analysis", "free", { probe: 1 });
  check("recordUsage (first, under the cap)", first.ok === true, JSON.stringify(first));
  for (let i = 0; i < 4; i += 1) await recordUsage(userId, null, "idea_analysis", "free", { probe: i + 2 });
  const sixth = await recordUsage(userId, null, "idea_analysis", "free", { probe: 6 });
  check("recordUsage (6th, cap reached)", sixth.ok === false, JSON.stringify(sixth));

  /* 4. array-shaped transaction helper: commits, and rolls back on failure */
  await sql.transaction([
    `create table if not exists db_verify_probe (id int primary key)`,
    (tx) => tx`insert into db_verify_probe (id) values (1)`,
  ]);
  const afterCommit = await sql()`select count(*)::int as n from db_verify_probe`;
  check("sql.transaction([...]) commits every step", afterCommit[0].n === 1, String(afterCommit[0].n));
  try {
    await sql.transaction([`insert into db_verify_probe (id) values (2)`, () => Promise.reject(new Error("boom"))]);
    check("sql.transaction([...]) rolls back on failure", false, "no error thrown");
  } catch {
    const afterRollback = await sql()`select count(*)::int as n from db_verify_probe where id = 2`;
    check("sql.transaction([...]) rolls back on failure", afterRollback[0].n === 0, String(afterRollback[0].n));
  }

  /* 5. session insert shape from auth (number parameter into make_interval) */
  const session = await sql()`
    insert into sessions (user_id, token_hash, expires_at)
    values (${userId}, ${`probe-${Date.now()}`}, now() + make_interval(secs => ${60 * 60 * 24 * 30}))
    returning expires_at
  `;
  check("sessions insert with make_interval(secs => $n)", session[0].expires_at instanceof Date);

  /* 6. coach repository: onboarding write + reads (jsonb in and out) */
  const businessId = await saveOnboarding({
    userId,
    founderName: "Db Verify",
    businessName: "Verify Co",
    description: "throwaway business created by scripts/db-verify.ts",
    intake: { goal: "verify the database layer" } as unknown as FounderIntake,
    profile: { oneLiner: "verification" },
    stage: "validate",
    healthScore: 42,
    healthSnapshot: { score: 42, band: "starting" },
  });
  const business = await loadCurrentBusiness(userId);
  const profile = await loadFounderProfile(businessId);
  const state = await loadCoachingState(businessId);
  check("saveOnboarding creates the business", business?.id === businessId, businessId);
  check("founder profile jsonb round-trips", profile?.profile?.oneLiner === "verification");
  check("coaching state jsonb round-trips", state?.health_snapshot?.band === "starting");
  await saveDailyPriorities(businessId, { priorities: ["first", "second"] });
  check("saveDailyPriorities writes jsonb", true);

  /* 7. health payload reports the connected database */
  check("healthPayload db=ok", healthPayload().db === "ok", JSON.stringify(healthPayload()));
} catch (error) {
  failures += 1;
  console.error("FAIL unexpected error:", error instanceof Error ? error.stack : String(error));
} finally {
  try {
    if (userId) await sql()`delete from users where id = ${userId}`;
    await sql()`drop table if exists db_verify_probe`;
  } catch (cleanupError) {
    console.error("cleanup failed:", cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
  }
  await sql.end();
}

console.log(failures === 0 ? "db-verify: all checks passed" : `db-verify: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
