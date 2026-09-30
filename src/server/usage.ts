/**
 * Usage limiting + event recording — server-only.
 *
 * usage_events doubles as (a) the audit/analytics log and (b) the enforcement
 * ledger: limits are enforced by the same table they record into, atomically,
 * in a single round-trip (INSERT ... SELECT ... WHERE count < max RETURNING id).
 *
 * Every usage row snapshots the plan and carries the business/feature at time
 * of use, so analytics stay truthful after plan changes.
 */

import { sql } from "~/db";
import { planById, type Feature, type LimitWindow, type PlanId } from "./plans";

export type UsageMeta = Record<string, unknown>;

export type LimitCheck =
  | { ok: true; remaining: number }
  | { ok: false; reason: "limit_reached" };

export type UsageRecord =
  | { ok: true; recorded: true; id: string }
  | { ok: false; reason: "limit_reached" };

/**
 * SQL expression for the start of the counting window.
 *
 * Returns *raw SQL text*, not a value: it must be interpolated as a fragment —
 * `${sql.unsafe(windowStart(window))}` — never as a plain parameter. Passing the
 * text as a parameter makes the driver serialize a timestamp from a string that
 * is not a timestamp (postgres.js: `RangeError: Invalid Date`), because the
 * expression is compared against `created_at timestamptz`.
 */
function windowStart(window: LimitWindow): string {
  return window === "day" ? "date_trunc('day', now())" : "date_trunc('month', now())";
}

/** The user's currently-active plan, falling back to Free when unknown. */
async function currentPlan(userId: string): Promise<PlanId> {
  const rows = await sql()`
    select s.plan from subscriptions s
    where s.user_id = ${userId} and s.status = 'active'
    order by s.created_at desc
    limit 1
  `;
  return (rows[0]?.plan as PlanId | undefined) ?? "free";
}

/** Count how many times this user used a feature inside the current window. */
async function countInWindow(userId: string, feature: Feature, window: LimitWindow): Promise<number> {
  const rows = await sql()`
    select count(*)::int as n from usage_events
    where user_id = ${userId}
      and feature = ${feature}
      and created_at >= ${sql.unsafe(windowStart(window))}
  `;
  return rows[0]?.n ?? 0;
}

/**
 * Read-only limit check for the user's current plan (pre-flight UI checks,
 * "N of M remaining" displays). Enforcement happens in recordUsage.
 */
export async function checkLimit(userId: string, feature: Feature): Promise<LimitCheck> {
  const plan = planById(await currentPlan(userId));
  const limit = plan.limits[feature];
  if (!limit || !Number.isFinite(limit.max)) {
    return { ok: true, remaining: Infinity };
  }
  const used = await countInWindow(userId, feature, limit.window);
  const remaining = limit.max - used;
  if (remaining <= 0) return { ok: false, reason: "limit_reached" };
  return { ok: true, remaining };
}

/**
 * Atomic enforce-and-record: one INSERT ... SELECT ... WHERE count < max
 * RETURNING id round-trip. When the cap is hit the INSERT matches zero rows,
 * nothing is recorded, and we report limit_reached — no separate count query,
 * no race between "check" and "record".
 */
export async function recordUsage(
  userId: string,
  businessId: string | null,
  feature: Feature,
  plan: PlanId,
  meta: UsageMeta = {},
): Promise<UsageRecord> {
  const limit = planById(plan).limits[feature];

  // Unlimited plan: plain insert, still snapshots the plan for analytics.
  if (!limit || !Number.isFinite(limit.max)) {
    const rows = await sql()`
      insert into usage_events (user_id, business_id, feature, plan, meta)
      values (${userId}, ${businessId}, ${feature}, ${plan}, ${JSON.stringify(meta)}::jsonb)
      returning id
    `;
    return { ok: true, recorded: true, id: String(rows[0].id) };
  }

  const rows = await sql()`
    insert into usage_events (user_id, business_id, feature, plan, meta)
    select ${userId}, ${businessId}, ${feature}, ${plan}, ${JSON.stringify(meta)}::jsonb
    where (
      select count(*) from usage_events
      where user_id = ${userId}
        and feature = ${feature}
        and created_at >= ${sql.unsafe(windowStart(limit.window))}
    ) < ${limit.max}::int
    returning id
  `;
  if (rows.length === 0) return { ok: false, reason: "limit_reached" };
  return { ok: true, recorded: true, id: String(rows[0].id) };
}

/**
 * Plan-aware helper: resolve the user's current plan, then atomically
 * enforce-and-record against it. This is what coach features call.
 */
export async function enforceAndRecord(
  userId: string,
  businessId: string | null,
  feature: Feature,
  meta: UsageMeta = {},
): Promise<UsageRecord> {
  const plan = await currentPlan(userId);
  return recordUsage(userId, businessId, feature, plan, meta);
}