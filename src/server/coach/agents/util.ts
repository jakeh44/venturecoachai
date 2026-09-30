/**
 * Shared agent plumbing: the coach persona, the context digest that goes into
 * every prompt, and the strict-but-forgiving coercions used to validate LLM
 * payloads. Validation throws on anything unusable so the engine can fall back
 * to the deterministic answer — it never half-trusts a model.
 */

import { stageBySlug } from "../stages";
import type { CoachContext, MetricTarget, PriorityTask } from "../types";

export const COACH_PERSONA = [
  "You are VentureCoach AI, a direct, data-driven business coach for solo founders and small-business owners.",
  "You are not a chatbot. You are an operating system that forces prioritisation.",
  "Rules: be specific and concrete; never generic advice; never motivational filler;",
  "always ground your answer in the founder's own numbers and current stage;",
  "never recommend optimising something that is not the current constraint;",
  "prefer one lever with a measurable outcome over a list of ideas.",
  "Every answer must end in a decision, an action, and a metric.",
].join(" ");

export const JSON_INSTRUCTION =
  "Reply with a single JSON object only. No prose, no markdown fences, no commentary outside the JSON.";

/** Clamp a number into a range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to `decimals` places (avoids 0.30000000000000004 style noise). */
export function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** ISO date (YYYY-MM-DD) for a Date. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO date of the Monday of `date`'s week (UTC) — the weekly plan's anchor. */
export function weekStart(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay(); // 0 = Sunday
  const delta = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + delta);
  return isoDate(copy);
}

/** A compact, prompt-friendly digest of everything the coach knows. */
export function contextDigest(ctx: CoachContext): string {
  const f = ctx.facts;
  const stage = stageBySlug(ctx.coaching?.currentStage ?? f.stage).slug;
  const money = (value: number | null) => (value === null ? "unknown" : `$${value.toLocaleString("en-US")}`);
  const count = (value: number | null) => (value === null ? "unknown" : String(value));
  const ratio = (value: number | null) => (value === null ? "unknown" : `${round(value * 100, 1)}%`);

  const lines = [
    `CURRENT STAGE: ${stage}`,
    `BUSINESS: ${f.name ?? "unnamed"}`,
    `WHAT IT DOES: ${f.description ?? "unknown"}`,
    `TARGET CUSTOMER: ${ctx.intake.target_customer ?? "unknown"}`,
    `MONTHLY REVENUE: ${money(f.monthlyRevenue)}`,
    `PAYING CUSTOMERS: ${count(f.customers)}`,
    `LEADS / MONTH: ${count(f.leadsPerMonth)}`,
    `LEAD→CUSTOMER CONVERSION: ${ratio(f.conversionRate)}`,
    `MONTHLY CHURN: ${ratio(f.churnRate)}`,
    `DELIVERY CAPACITY USED: ${ratio(f.capacityUtilization)}`,
    `FOUNDER HOURS / WEEK: ${count(f.hoursPerWeek)}`,
    `MONTHLY INCOME GOAL: ${money(f.incomeGoal)}`,
    `STARTUP CAPITAL AVAILABLE: ${money(f.startupCapital)}`,
    `HAS A DEFINED OFFER: ${f.hasOffer ? "yes" : "no"}`,
    `VALIDATION SIGNALS FOUND: ${f.validationEvidence}`,
    `DOCUMENTED PROCESSES: ${f.documentedProcesses}`,
    `TEAM SIZE: ${f.teamSize}`,
    `FOUNDER SELF-REPORTED OBSTACLE: ${f.selfReportedObstacle ?? "unknown"}`,
    `RUNNING EXPERIMENTS: ${
      Array.isArray(ctx.coaching?.weeklyExperiment)
        ? JSON.stringify(ctx.coaching?.weeklyExperiment)
        : "none recorded"
    }`,
    `WEEKLY OBJECTIVE: ${ctx.coaching?.weeklyObjective ?? "none set"}`,
    `HEALTH SCORE: ${ctx.coaching?.healthScore ?? "not computed"}`,
  ];
  if (ctx.input) lines.push(`FOUNDER INPUT: ${ctx.input}`);
  if (ctx.options?.length) lines.push(`OPTIONS CONSIDERED: ${ctx.options.join(" | ")}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* LLM payload coercion (throws = engine falls back)                   */
/* ------------------------------------------------------------------ */

/** Assert the payload is a plain object. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("llm_shape_not_object");
  }
  return value as Record<string, unknown>;
}

/** Required non-empty string. */
export function reqString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`llm_missing_${key}`);
  return value.trim();
}

/** Optional string, with a fallback. */
export function optString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Required finite number. */
export function reqNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error(`llm_bad_${key}`);
  return n;
}

/** Optional finite number clamped into a range. */
export function optNumber(
  record: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = record[key];
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

/** Coerce to an array of non-empty strings (accepts a single string). */
export function stringArray(value: unknown, max = 12): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max);
}

/** Coerce an LLM task object into `PriorityTask`, falling back per field. */
export function coerceTask(value: unknown, fallback: PriorityTask): PriorityTask {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    title: optString(record, "title", fallback.title),
    why: optString(record, "why", fallback.why),
    estMinutes: Math.round(
      clamp(typeof record.estMinutes === "number" ? record.estMinutes : fallback.estMinutes, 5, 480),
    ),
    doneWhen: optString(record, "doneWhen", fallback.doneWhen),
  };
}

/** Coerce an LLM metric object into `MetricTarget`. */
export function coerceMetric(value: unknown, fallback: MetricTarget): MetricTarget {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    name: optString(record, "name", fallback.name),
    target: optString(record, "target", fallback.target),
    why: optString(record, "why", fallback.why ?? ""),
  };
}
