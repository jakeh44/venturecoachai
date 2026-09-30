/**
 * repository.ts — the coach engine's database access (server-only).
 *
 * Every function here is called from inside a `createServerFn` handler, so the
 * import chain is dropped from the client build. Conventions follow the rest of
 * the foundation: plain single statements (each idempotent on its own),
 * `jsonb` parameters via JSON.stringify + ::jsonb cast, and
 * Dates coerced with the serialize helpers.
 */

import { sql } from "~/db";
import { dateToString, serializeRow, serializeRows } from "../serialize";
import type { FounderIntake } from "../coach/types";

export interface BusinessRow {
  id: string;
  name: string;
  description: string | null;
  stage: string | null;
  created_at: string | null;
}

export interface FounderProfileRow {
  business_id: string;
  answers: FounderIntake;
  profile: Record<string, unknown>;
  updated_at: string | null;
}

export interface CoachingStateRow {
  business_id: string;
  current_stage: string;
  weekly_objective: string | null;
  weekly_top_priorities: unknown;
  weekly_experiment: unknown;
  weekly_created_at: string | null;
  daily_priorities: unknown;
  daily_created_at: string | null;
  health_score: number | null;
  health_snapshot: Record<string, unknown>;
}

export interface ExperimentRow {
  id: string;
  title: string;
  hypothesis: string | null;
  metric: string | null;
  status: string;
  started_at: string | null;
  created_at: string | null;
  result: unknown;
}

/** Full experiment row (tracker page: dates, status, result, learning). */
export interface ExperimentFullRow {
  id: string;
  title: string;
  hypothesis: string | null;
  metric: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  result: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface IdeaAnalysisRow {
  id: string;
  scores: unknown;
  known_assumed_unknown: unknown;
  validation_plan: unknown;
  summary: string | null;
  source: string;
  created_at: string | null;
}

export interface DecisionRow {
  id: string;
  prompt: string;
  options: unknown;
  criteria: unknown;
  steps: unknown;
  recommendation: unknown;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** The user's current business, or null before onboarding. */
export async function loadCurrentBusiness(userId: string): Promise<BusinessRow | null> {
  const rows = await sql()`
    select id, name, description, stage, created_at
    from businesses
    where user_id = ${userId} and is_current
    order by created_at desc
    limit 1
  `;
  if (rows.length === 0) return null;
  return serializeRow(rows[0] as Record<string, unknown>) as unknown as BusinessRow;
}

export async function loadFounderProfile(businessId: string): Promise<FounderProfileRow | null> {
  const rows = await sql()`
    select business_id, answers, profile, updated_at
    from founder_profiles
    where business_id = ${businessId}
    limit 1
  `;
  if (rows.length === 0) return null;
  return serializeRow(rows[0] as Record<string, unknown>) as unknown as FounderProfileRow;
}

export async function loadCoachingState(businessId: string): Promise<CoachingStateRow | null> {
  const rows = await sql()`
    select business_id, current_stage, weekly_objective, weekly_top_priorities, weekly_experiment,
           weekly_created_at, daily_priorities, daily_created_at, health_score, health_snapshot
    from coaching_state
    where business_id = ${businessId}
    limit 1
  `;
  if (rows.length === 0) return null;
  return serializeRow(rows[0] as Record<string, unknown>) as unknown as CoachingStateRow;
}

export async function loadExperiments(businessId: string, limit = 6): Promise<ExperimentRow[]> {
  const rows = await sql()`
    select id, title, hypothesis, metric, status, started_at, created_at, result
    from experiments
    where business_id = ${businessId}
    order by created_at desc
    limit ${limit}
  `;
  return serializeRows(rows as Record<string, unknown>[]) as unknown as ExperimentRow[];
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface OnboardingWrite {
  userId: string;
  /** Founder name from question 1 — also stored on users.name. */
  founderName: string | null;
  businessName: string;
  description: string | null;
  intake: FounderIntake;
  profile: Record<string, unknown>;
  stage: string;
  healthScore: number;
  healthSnapshot: Record<string, unknown>;
}

/**
 * Persist a completed onboarding run: business (created once, then updated),
 * founder profile (business memory) and coaching state (stage + health).
 *
 * Sequential, idempotent statements rather than one transaction: re-running
 * onboarding must update the existing business, and each step is safe on its
 * own. (Interactive transactions are available via `sql.begin` since the move
 * to postgres.js — see src/db.ts — but this path does not need one.)
 */
export async function saveOnboarding(write: OnboardingWrite): Promise<string> {
  const existing = await loadCurrentBusiness(write.userId);
  let businessId: string;

  if (existing) {
    await sql()`
      update businesses
      set name = ${write.businessName}, description = ${write.description}, stage = ${write.stage}
      where id = ${existing.id}
    `;
    businessId = existing.id;
  } else {
    const rows = await sql()`
      insert into businesses (user_id, name, description, stage, is_current)
      values (${write.userId}, ${write.businessName}, ${write.description}, ${write.stage}, true)
      returning id
    `;
    businessId = String(rows[0].id);
  }

  await sql()`
    insert into founder_profiles (business_id, answers, profile)
    values (${businessId}, ${JSON.stringify(write.intake)}::jsonb, ${JSON.stringify(write.profile)}::jsonb)
    on conflict (business_id) do update
      set answers = excluded.answers,
          profile = excluded.profile,
          version = founder_profiles.version + 1
  `;

  await sql()`
    insert into coaching_state (business_id, current_stage, health_score, health_snapshot)
    values (${businessId}, ${write.stage}, ${write.healthScore}, ${JSON.stringify(write.healthSnapshot)}::jsonb)
    on conflict (business_id) do update
      set current_stage = excluded.current_stage,
          health_score = excluded.health_score,
          health_snapshot = excluded.health_snapshot
  `;

  if (write.founderName) {
    await sql()`update users set name = ${write.founderName} where id = ${write.userId}`;
  }

  return businessId;
}

/** Cache a generated daily plan (the Free plan's 1/day cap depends on this). */
export async function saveDailyPriorities(businessId: string, payload: unknown): Promise<void> {
  await sql()`
    update coaching_state
    set daily_priorities = ${JSON.stringify(payload)}::jsonb, daily_created_at = now()
    where business_id = ${businessId}
  `;
}

/** Cache a generated weekly plan + its experiment. */
export async function saveWeeklyPlan(
  businessId: string,
  payload: { objective: string; priorities: string[]; experiment: unknown },
): Promise<void> {
  await sql()`
    update coaching_state
    set weekly_objective = ${payload.objective},
        weekly_top_priorities = ${JSON.stringify(payload.priorities)}::jsonb,
        weekly_experiment = ${JSON.stringify(payload.experiment)}::jsonb,
        weekly_created_at = now()
    where business_id = ${businessId}
  `;
}

/** Record the detected stage on both the business and its coaching state. */
export async function saveStage(businessId: string, stage: string): Promise<void> {
  await sql()`update businesses set stage = ${stage} where id = ${businessId}`;
  await sql()`
    insert into coaching_state (business_id, current_stage)
    values (${businessId}, ${stage})
    on conflict (business_id) do update set current_stage = excluded.current_stage
  `;
}

/** Merge a patch into health_snapshot (keeps unrelated keys intact). */
export async function mergeHealthSnapshot(
  businessId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await sql()`
    update coaching_state
    set health_snapshot = coalesce(health_snapshot, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
    where business_id = ${businessId}
  `;
}

export async function saveHealthScore(
  businessId: string,
  score: number,
  snapshot: Record<string, unknown>,
): Promise<void> {
  await sql()`
    update coaching_state
    set health_score = ${score}, health_snapshot = ${JSON.stringify(snapshot)}::jsonb
    where business_id = ${businessId}
  `;
}

/**
 * Persist an experiment so the Experiment tracker and the dashboard's "active
 * experiments" reflect the weekly plan. Idempotent on (business_id, title) for
 * proposed/running rows.
 */
export async function upsertExperiment(
  businessId: string,
  experiment: { title: string; hypothesis: string; metric: string },
): Promise<void> {
  const existing = await sql()`
    select id from experiments
    where business_id = ${businessId} and title = ${experiment.title} and status in ('proposed','running')
    limit 1
  `;
  if (existing.length > 0) return;
  await sql()`
    insert into experiments (business_id, title, hypothesis, metric, status, started_at)
    values (${businessId}, ${experiment.title}, ${experiment.hypothesis}, ${experiment.metric}, 'running', now())
  `;
}

/**
 * Persist an idea analysis (Business memory + the analyzer's history).
 *
 * `scores` carries the weighted overall score plus the 15 category scores, and
 * also stashes the title/grade/verdict the founder saw (there is no dedicated
 * column for them — the history list reads them back out of the same jsonb).
 */
export async function insertIdeaAnalysis(
  businessId: string,
  data: {
    overallScore: number;
    categories: unknown;
    knownAssumedUnknown: unknown;
    validationPlan: unknown;
    summary: string;
    title?: string | null;
    grade?: string | null;
    verdict?: string | null;
  },
  source: "llm" | "deterministic",
): Promise<string> {
  const scores: Record<string, unknown> = {
    overallScore: data.overallScore,
    categories: data.categories,
  };
  if (data.title) scores.title = data.title;
  if (data.grade) scores.grade = data.grade;
  if (data.verdict) scores.verdict = data.verdict;

  const rows = await sql()`
    insert into idea_analyses (business_id, scores, known_assumed_unknown, validation_plan, summary, source)
    values (
      ${businessId},
      ${JSON.stringify(scores)}::jsonb,
      ${JSON.stringify(data.knownAssumedUnknown)}::jsonb,
      ${JSON.stringify(data.validationPlan)}::jsonb,
      ${data.summary},
      ${source}
    )
    returning id
  `;
  return String(rows[0]?.id ?? "");
}

/** Past idea analyses for a business, newest first (the analyzer's history). */
export async function loadIdeaAnalyses(businessId: string, limit = 12): Promise<IdeaAnalysisRow[]> {
  const rows = await sql()`
    select id, scores, known_assumed_unknown, validation_plan, summary, source, created_at
    from idea_analyses
    where business_id = ${businessId}
    order by created_at desc
    limit ${limit}
  `;
  return serializeRows(rows as Record<string, unknown>[]) as unknown as IdeaAnalysisRow[];
}

/* ------------------------------------------------------------------ */
/* Decision Engine (decisions)                                         */
/* ------------------------------------------------------------------ */

/**
 * Decision walkthroughs, newest first.
 *
 * `steps` is a jsonb bag rather than a bare array: it holds the 14-step
 * framework (`items`), how far the founder got (`progress`), their per-step
 * notes (`notes`) and the commit date — so a walkthrough can be resumed in a
 * later session without a schema change. `options` likewise wraps the engine's
 * scored options (`scored`) together with the founder's own pros/cons (`input`).
 * `normalizeDecisionRow` (service layer) tolerates the legacy bare-array shape.
 */
export async function loadDecisionRuns(businessId: string, limit = 10): Promise<DecisionRow[]> {
  const rows = await sql()`
    select id, prompt, options, criteria, steps, recommendation, status, created_at, updated_at
    from decisions
    where business_id = ${businessId}
    order by created_at desc
    limit ${limit}
  `;
  return serializeRows(rows as Record<string, unknown>[]) as unknown as DecisionRow[];
}

export async function loadDecisionRun(id: string, businessId: string): Promise<DecisionRow | null> {
  const rows = await sql()`
    select id, prompt, options, criteria, steps, recommendation, status, created_at, updated_at
    from decisions
    where id = ${id} and business_id = ${businessId}
    limit 1
  `;
  if (rows.length === 0) return null;
  return serializeRow(rows[0] as Record<string, unknown>) as unknown as DecisionRow;
}

/** Insert a walkthrough and return its id (the UI resumes against that id). */
export async function insertDecisionRun(
  businessId: string,
  data: {
    prompt: string;
    options: unknown;
    criteria: unknown;
    steps: unknown;
    recommendation: unknown;
  },
  source: "llm" | "deterministic",
): Promise<string> {
  const rows = await sql()`
    insert into decisions (business_id, prompt, options, criteria, steps, recommendation, source)
    values (
      ${businessId},
      ${data.prompt || "Untitled decision"},
      ${JSON.stringify(data.options)}::jsonb,
      ${JSON.stringify(data.criteria)}::jsonb,
      ${JSON.stringify({ items: data.steps, progress: 0, notes: {} })}::jsonb,
      ${JSON.stringify(data.recommendation)}::jsonb,
      ${source}
    )
    returning id
  `;
  return String(rows[0]?.id ?? "");
}

/** Merge walkthrough progress / notes / status into an existing row. */
export async function updateDecisionRun(
  id: string,
  businessId: string,
  patch: {
    steps?: Record<string, unknown>;
    status?: "open" | "decided" | "abandoned";
    recommendation?: unknown;
  },
): Promise<DecisionRow | null> {
  const rows = await sql()`
    update decisions set
      steps = coalesce(steps, '{}'::jsonb) || ${JSON.stringify(patch.steps ?? {})}::jsonb,
      status = coalesce(${patch.status ?? null}::text, status),
      recommendation = coalesce(${patch.recommendation ? JSON.stringify(patch.recommendation) : null}::jsonb, recommendation),
      updated_at = now()
    where id = ${id} and business_id = ${businessId}
    returning id, prompt, options, criteria, steps, recommendation, status, created_at, updated_at
  `;
  if (rows.length === 0) return null;
  return serializeRow(rows[0] as Record<string, unknown>) as unknown as DecisionRow;
}

/* ------------------------------------------------------------------ */
/* Experiment tracker (experiments)                                    */
/* ------------------------------------------------------------------ */

/** Every experiment for a business, newest first (tracker + "don't retest this"). */
export async function loadExperimentsFull(businessId: string, limit = 50): Promise<ExperimentFullRow[]> {
  const rows = await sql()`
    select id, title, hypothesis, metric, status, started_at, ended_at, result, created_at, updated_at
    from experiments
    where business_id = ${businessId}
    order by created_at desc
    limit ${limit}
  `;
  return serializeRows(rows as Record<string, unknown>[]) as unknown as ExperimentFullRow[];
}

export async function loadExperiment(id: string, businessId: string): Promise<ExperimentFullRow | null> {
  const rows = await sql()`
    select id, title, hypothesis, metric, status, started_at, ended_at, result, created_at, updated_at
    from experiments
    where id = ${id} and business_id = ${businessId}
    limit 1
  `;
  if (rows.length === 0) return null;
  return serializeRow(rows[0] as Record<string, unknown>) as unknown as ExperimentFullRow;
}

/**
 * Create an experiment. The tracker's richer fields (expected result, cost,
 * time required, failure threshold, outcome, learning) live inside `result`
 * jsonb — the dashboard's `DashboardExperiment` contract (title / hypothesis /
 * metric / status / startedAt) is served by the columns, so both stay in sync.
 */
export async function insertExperiment(
  businessId: string,
  data: {
    title: string;
    hypothesis: string | null;
    metric: string | null;
    status: "proposed" | "running" | "done" | "dropped";
    startedAt: string | null;
    endedAt: string | null;
    result: Record<string, unknown>;
  },
): Promise<ExperimentFullRow | null> {
  const rows = await sql()`
    insert into experiments (business_id, title, hypothesis, metric, status, started_at, ended_at, result)
    values (
      ${businessId},
      ${data.title},
      ${data.hypothesis},
      ${data.metric},
      ${data.status},
      ${data.startedAt}::timestamptz,
      ${data.endedAt}::timestamptz,
      ${JSON.stringify(data.result)}::jsonb
    )
    returning id, title, hypothesis, metric, status, started_at, ended_at, result, created_at, updated_at
  `;
  if (rows.length === 0) return null;
  return serializeRow(rows[0] as Record<string, unknown>) as unknown as ExperimentFullRow;
}

/**
 * Patch an experiment. Null means "leave as is" for every field except
 * `startedAt` / `endedAt`, which use the `clearStartedAt` / `clearEndedAt`
 * flags (null is a meaningful value for a date you are removing).
 */
export async function updateExperiment(
  id: string,
  businessId: string,
  patch: {
    title?: string | null;
    hypothesis?: string | null;
    metric?: string | null;
    status?: "proposed" | "running" | "done" | "dropped" | null;
    startedAt?: string | null;
    endedAt?: string | null;
    clearStartedAt?: boolean;
    clearEndedAt?: boolean;
    result?: Record<string, unknown> | null;
  },
): Promise<ExperimentFullRow | null> {
  const rows = await sql()`
    update experiments set
      title = coalesce(${patch.title ?? null}::text, title),
      hypothesis = coalesce(${patch.hypothesis ?? null}::text, hypothesis),
      metric = coalesce(${patch.metric ?? null}::text, metric),
      status = coalesce(${patch.status ?? null}::text, status),
      started_at = case when ${patch.clearStartedAt === true} then null
                        else coalesce(${patch.startedAt ?? null}::timestamptz, started_at) end,
      ended_at = case when ${patch.clearEndedAt === true} then null
                      else coalesce(${patch.endedAt ?? null}::timestamptz, ended_at) end,
      result = coalesce(${patch.result ? JSON.stringify(patch.result) : null}::jsonb, result),
      updated_at = now()
    where id = ${id} and business_id = ${businessId}
    returning id, title, hypothesis, metric, status, started_at, ended_at, result, created_at, updated_at
  `;
  if (rows.length === 0) return null;
  return serializeRow(rows[0] as Record<string, unknown>) as unknown as ExperimentFullRow;
}

/** Persist a decision walkthrough (open until the founder marks it decided). */
export async function insertDecision(
  businessId: string,
  data: {
    prompt: string;
    options: unknown;
    criteria: unknown;
    steps: unknown;
    recommendation: unknown;
  },
  source: "llm" | "deterministic",
): Promise<void> {
  await sql()`
    insert into decisions (business_id, prompt, options, criteria, steps, recommendation, source)
    values (
      ${businessId},
      ${data.prompt || "Untitled decision"},
      ${JSON.stringify(data.options)}::jsonb,
      ${JSON.stringify(data.criteria)}::jsonb,
      ${JSON.stringify(data.steps)}::jsonb,
      ${JSON.stringify(data.recommendation)}::jsonb,
      ${source}
    )
  `;
}

/** True when the given ISO timestamp falls on today's UTC date. */
export function isToday(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  return dateToString(value)?.slice(0, 10) === now.toISOString().slice(0, 10);
}

/** True when the given ISO timestamp falls in the current Mon–Sun week. */
export function isThisWeek(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const stamp = Date.parse(dateToString(value) ?? "");
  if (Number.isNaN(stamp)) return false;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return stamp >= weekAgo && stamp <= now.getTime() + 60_000;
}
