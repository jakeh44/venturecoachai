/**
 * service.ts — the coach engine's persistence + caching layer (server-only).
 *
 * Responsibilities:
 *  - assemble a `CoachContext` from the database (founder profile answers,
 *    business row, coaching state, derived facts)
 *  - run intents through the engine and CACHE the results (the Free plan's
 *    "1 daily priority session/day" only makes sense with a cache: the first
 *    load generates, every later load replays)
 *  - keep the business row, coaching state and health snapshot in sync
 *  - persist richer artifacts (idea analyses, decisions, experiments) so
 *    Business memory keeps growing
 */

import { dbAvailable } from "../env";
import { checkLimit } from "../usage";
import type { Feature } from "../plans";
import { runCoach, type RunCoachOptions } from "./engine";
import { computeHealthScore, type HealthScore } from "./health";
import { deriveFacts } from "./intake";
import * as repo from "./repository";
import type {
  BottleneckData,
  BusinessFacts,
  CoachContext,
  CoachResult,
  CoachingStateSnapshot,
  DailyPrioritiesData,
  DecisionGuidanceData,
  DecisionRecord,
  DecisionStartInput,
  ExperimentInput,
  ExperimentRecord,
  ExperimentStatus,
  FounderIntake,
  IdeaAnalysisData,
  IdeaAnalysisInput,
  IdeaAnalysisRecord,
  StageDetectionData,
  ValidationPlanData,
  WeeklyPlanData,
} from "./types";
import {
  buildCoachContext,
  emptyFacts,
  normalizeDecisionRow,
  normalizeExperimentRow,
  normalizeIdeaAnalysisRow,
} from "./types";

/** Everything the coach knows about one founder, loaded once per request. */
export interface CoachWorkspace {
  userId: string;
  hasBusiness: boolean;
  business: repo.BusinessRow | null;
  profile: repo.FounderProfileRow | null;
  coaching: repo.CoachingStateRow | null;
  intake: FounderIntake;
  facts: BusinessFacts;
  context: CoachContext;
  health: HealthScore;
  experiments: repo.ExperimentRow[];
}

function pickDefined<T extends object>(source: Partial<T> | null | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!source) return out;
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

function snapshotFrom(coaching: repo.CoachingStateRow | null): CoachingStateSnapshot | null {
  if (!coaching) return null;
  return {
    currentStage: (coaching.current_stage ?? "find") as CoachingStateSnapshot["currentStage"],
    weeklyObjective: coaching.weekly_objective,
    weeklyTopPriorities: Array.isArray(coaching.weekly_top_priorities)
      ? (coaching.weekly_top_priorities as string[])
      : [],
    weeklyExperiment: coaching.weekly_experiment,
    dailyPriorities: coaching.daily_priorities,
    healthScore: coaching.health_score,
    healthSnapshot: coaching.health_snapshot ?? {},
    dailyCreatedAt: coaching.daily_created_at,
    weeklyCreatedAt: coaching.weekly_created_at,
  };
}

/** Load the whole coaching workspace for a user (no business yet is valid). */
export async function loadWorkspace(userId: string, now = new Date()): Promise<CoachWorkspace> {
  const business = await repo.loadCurrentBusiness(userId);
  const profile = business ? await repo.loadFounderProfile(business.id) : null;
  const coaching = business ? await repo.loadCoachingState(business.id) : null;
  const experiments = business ? await repo.loadExperiments(business.id) : [];

  const intake: FounderIntake = profile?.answers ?? {};
  const storedFacts = (coaching?.health_snapshot?.facts ?? {}) as Partial<BusinessFacts>;
  const facts: BusinessFacts = {
    ...emptyFacts(),
    ...pickDefined(deriveFacts(intake)),
    ...pickDefined(storedFacts),
    stage: (business?.stage as BusinessFacts["stage"]) ?? null,
  };

  const context = buildCoachContext({
    userId,
    businessId: business?.id ?? null,
    intake,
    facts,
    coaching: snapshotFrom(coaching),
    now,
  });

  return {
    userId,
    hasBusiness: Boolean(business),
    business,
    profile,
    coaching,
    intake,
    facts,
    context,
    health: computeHealthScore(context),
    experiments,
  };
}

/** Pre-flight limit check — never blocks on a bookkeeping failure. */
async function withinLimit(userId: string, feature: Feature): Promise<boolean> {
  try {
    const check = await checkLimit(userId, feature);
    return check.ok;
  } catch {
    return true;
  }
}

/** Reconstruct a cached result (same envelope, marked as a replay). */
function cached<T>(intent: CoachResult<T>["intent"], stored: unknown): CoachResult<T> | null {
  if (!stored || typeof stored !== "object") return null;
  const record = stored as Record<string, unknown>;
  if (!record.data || typeof record.data !== "object") return null;
  return {
    intent,
    data: record.data as T,
    source: record.source === "llm" ? "llm" : "deterministic",
    model: typeof record.model === "string" ? record.model : undefined,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : new Date().toISOString(),
    degraded: typeof record.degraded === "string" ? record.degraded : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Stage detection (also keeps businesses.stage + health in sync)      */
/* ------------------------------------------------------------------ */

/** Re-derive the workspace from a freshly detected stage (single source of truth). */
export function withStage(workspace: CoachWorkspace, stage: StageDetectionData["stage"]): CoachWorkspace {
  const context: CoachContext = {
    ...workspace.context,
    facts: { ...workspace.facts, stage },
    coaching: workspace.context.coaching
      ? { ...workspace.context.coaching, currentStage: stage }
      : null,
  };
  return { ...workspace, context, facts: context.facts, health: computeHealthScore(context) };
}

export async function getStage(
  workspace: CoachWorkspace,
  opts: RunCoachOptions = {},
): Promise<CoachResult<StageDetectionData>> {
  const result = await runCoach("stage_detection", workspace.context, opts);
  const detected = result.data.stage;
  const refreshed = withStage(workspace, detected);
  const storedStage = workspace.coaching?.current_stage ?? workspace.business?.stage ?? null;
  const storedHealth = workspace.coaching?.health_score ?? null;

  if (
    workspace.business &&
    (storedStage !== detected || storedHealth !== refreshed.health.score)
  ) {
    try {
      if (storedStage !== detected) await repo.saveStage(workspace.business.id, detected);
      await repo.saveHealthScore(workspace.business.id, refreshed.health.score, {
        ...(workspace.coaching?.health_snapshot ?? {}),
        facts: refreshed.facts,
        health: {
          score: refreshed.health.score,
          band: refreshed.health.band,
          components: refreshed.health.components,
          headline: refreshed.health.headline,
        },
        stage: { slug: detected, at: result.generatedAt, source: result.source },
      });
    } catch {
      // Persisting is best-effort; the coaching answer still stands.
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Bottleneck (cached per day, keyed to the detected stage)            */
/* ------------------------------------------------------------------ */

export async function getBottleneck(
  workspace: CoachWorkspace,
  opts: { regenerate?: boolean } & RunCoachOptions = {},
): Promise<CoachResult<BottleneckData>> {
  const stored = cached<BottleneckData>("bottleneck", workspace.coaching?.health_snapshot?.bottleneck);
  const fresh = repo.isToday(
    (workspace.coaching?.health_snapshot?.bottleneck as { generatedAt?: string } | undefined)?.generatedAt,
    workspace.context.now,
  );

  if (stored && fresh && !opts.regenerate) return stored;
  if (opts.regenerate && !(await withinLimit(workspace.userId, "bottleneck"))) {
    if (stored) return { ...stored, limited: true };
  }

  const result = await runCoach("bottleneck", workspace.context, opts);
  if (workspace.business) {
    try {
      await repo.mergeHealthSnapshot(workspace.business.id, { bottleneck: result });
    } catch {
      /* best-effort */
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Daily priorities (regenerated once per day unless asked)            */
/* ------------------------------------------------------------------ */

export async function getDailyPriorities(
  workspace: CoachWorkspace,
  opts: { regenerate?: boolean } & RunCoachOptions = {},
): Promise<CoachResult<DailyPrioritiesData>> {
  const stored = cached<DailyPrioritiesData>("daily_priorities", workspace.coaching?.daily_priorities);
  if (stored && repo.isToday(workspace.coaching?.daily_created_at, workspace.context.now) && !opts.regenerate) {
    return stored;
  }
  if (opts.regenerate && !(await withinLimit(workspace.userId, "daily_priorities"))) {
    if (stored) return { ...stored, limited: true };
  }

  // Daily priorities are constraint-led, so the constraint must be current.
  const bottleneck = await getBottleneck(workspace, { ...opts, regenerate: false });
  const result = await runCoach(
    "daily_priorities",
    { ...workspace.context, coaching: withConstraint(workspace, bottleneck.data) },
    opts,
  );
  if (workspace.business) {
    try {
      await repo.saveDailyPriorities(workspace.business.id, result);
    } catch {
      /* best-effort */
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Weekly plan (regenerated once per week unless asked)                */
/* ------------------------------------------------------------------ */

export async function getWeeklyPlan(
  workspace: CoachWorkspace,
  opts: { regenerate?: boolean } & RunCoachOptions = {},
): Promise<CoachResult<WeeklyPlanData>> {
  const storedWeekly = cached<WeeklyPlanData>("weekly_plan", workspace.coaching?.health_snapshot?.weekly);
  const freshWeekly = repo.isThisWeek(workspace.coaching?.weekly_created_at, workspace.context.now);

  if (storedWeekly && freshWeekly && !opts.regenerate) return storedWeekly;
  if (opts.regenerate && storedWeekly && !(await withinLimit(workspace.userId, "weekly_plan"))) {
    return { ...storedWeekly, limited: true };
  }

  const result = await runCoach("weekly_plan", workspace.context, opts);
  if (workspace.business) {
    try {
      await repo.saveWeeklyPlan(workspace.business.id, {
        objective: result.data.objective,
        priorities: result.data.priorities,
        experiment: result.data.experiment,
      });
      await repo.mergeHealthSnapshot(workspace.business.id, { weekly: result });
      await repo.upsertExperiment(workspace.business.id, {
        title: result.data.experiment.title,
        hypothesis: result.data.experiment.hypothesis,
        metric: result.data.experiment.metric,
      });
    } catch {
      /* best-effort */
    }
  }
  return result;
}

/** Fold the freshly computed constraint into the coaching snapshot. */
function withConstraint(workspace: CoachWorkspace, constraint: BottleneckData): CoachingStateSnapshot | null {
  const base = workspace.context.coaching;
  if (!base) return null;
  return { ...base, healthSnapshot: { ...base.healthSnapshot, constraint } };
}

/* ------------------------------------------------------------------ */
/* On-demand artifacts (no caching; each call is a deliberate action)  */
/* ------------------------------------------------------------------ */

export async function getIdeaAnalysis(
  workspace: CoachWorkspace,
  opts: RunCoachOptions & { input?: IdeaAnalysisInput } = {},
): Promise<{ result: CoachResult<IdeaAnalysisData>; record: IdeaAnalysisRecord | null }> {
  const input = opts.input;
  const context: CoachContext = input
    ? { ...workspace.context, intake: { ...workspace.intake, ...ideaIntakeOverlay(input) }, input: ideaPrompt(input) }
    : workspace.context;
  const { input: _input, ...runOpts } = opts;
  const result = await runCoach("idea_analysis", context, runOpts);

  let record: IdeaAnalysisRecord | null = null;
  if (workspace.business) {
    try {
      const id = await repo.insertIdeaAnalysis(
        workspace.business.id,
        {
          ...result.data,
          title: ideaTitle(input, workspace.business.name),
        },
        result.source,
      );
      record = normalizeIdeaAnalysisRow({
        id,
        scores: {
          overallScore: result.data.overallScore,
          categories: result.data.categories,
          title: ideaTitle(input, workspace.business.name),
          grade: result.data.grade,
          verdict: result.data.verdict,
        },
        known_assumed_unknown: result.data.knownAssumedUnknown,
        validation_plan: result.data.validationPlan,
        summary: result.data.summary,
        source: result.source,
        created_at: new Date().toISOString(),
      });
    } catch {
      /* best-effort: persistence never blocks the analysis */
    }
  }
  return { result, record };
}

/** The analyzer's history for this business (newest first, renderable rows only). */
export async function loadIdeaAnalysisHistory(workspace: CoachWorkspace): Promise<IdeaAnalysisRecord[]> {
  if (!workspace.business) return [];
  try {
    const rows = await repo.loadIdeaAnalyses(workspace.business.id);
    return rows
      .map((row) => normalizeIdeaAnalysisRow(row as unknown as Record<string, unknown>))
      .filter((row): row is IdeaAnalysisRecord => row !== null);
  } catch {
    return [];
  }
}

/**
 * Fold the analyzer form into the intake the agents read: `business_idea`,
 * `target_customer` etc. are the same slugs onboarding uses, so an analyzed
 * idea is scored on its own words (and shown back in the KNOWN split) without
 * ever mutating the founder's saved profile.
 */
export function ideaIntakeOverlay(input: IdeaAnalysisInput): FounderIntake {
  const overlay: FounderIntake = {};
  const idea = [input.title, input.description].map((part) => part.trim()).filter(Boolean).join(". ");
  if (idea) overlay.business_idea = idea.slice(0, 800);
  if (input.targetCustomer?.trim()) overlay.target_customer = input.targetCustomer.trim().slice(0, 300);
  if (input.alternative?.trim()) overlay.current_alternative = input.alternative.trim().slice(0, 300);
  if (input.priceRange?.trim()) overlay.price_range = input.priceRange.trim().slice(0, 120);
  return overlay;
}

function ideaPrompt(input: IdeaAnalysisInput): string {
  return [
    `IDEA: ${input.title.trim()}`,
    input.description.trim() ? `DETAIL: ${input.description.trim()}` : "",
    input.targetCustomer?.trim() ? `TARGET CUSTOMER: ${input.targetCustomer.trim()}` : "",
    input.alternative?.trim() ? `CURRENT ALTERNATIVE: ${input.alternative.trim()}` : "",
    input.priceRange?.trim() ? `PRICE RANGE: ${input.priceRange.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function ideaTitle(input: IdeaAnalysisInput | undefined, businessName: string | null): string {
  const typed = input?.title.trim();
  return (typed || businessName || "Business idea").slice(0, 120);
}

/** Run a Decision Engine walkthrough and persist it so it can be resumed. */
export async function startDecisionRun(
  workspace: CoachWorkspace,
  input: DecisionStartInput,
  opts: RunCoachOptions = {},
): Promise<{ result: CoachResult<DecisionGuidanceData>; record: DecisionRecord | null }> {
  const labels = input.options.map((option) => option.label.trim()).filter(Boolean).slice(0, 5);
  const detail = input.options
    .filter((option) => option.label.trim())
    .slice(0, 5)
    .map((option) => {
      const pros = option.pros?.trim();
      const cons = option.cons?.trim();
      return [
        `- ${option.label.trim()}`,
        pros ? `pros: ${pros}` : "",
        cons ? `cons: ${cons}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
  const prompt = `${input.title.trim()}\n\n${input.context?.trim() ?? ""}\n\nOptions on the table:\n${detail}`.trim();

  const result = await runDecisionGuidance(workspace, { prompt, options: labels }, opts);

  let record: DecisionRecord | null = null;
  if (workspace.business) {
    try {
      const id = await repo.insertDecisionRun(
        workspace.business.id,
        {
          prompt: [input.title.trim(), input.context?.trim()].filter(Boolean).join(" — ").slice(0, 600),
          options: {
            scored: result.data.options,
            input: input.options
              .filter((option) => option.label.trim())
              .slice(0, 5)
              .map((option) => ({
                label: option.label.trim(),
                pros: option.pros?.trim() ?? "",
                cons: option.cons?.trim() ?? "",
              })),
          },
          criteria: result.data.criteria,
          steps: result.data.steps,
          recommendation: {
            ...(result.data.recommendation ?? {}),
            doorType: result.data.doorType,
            summary: result.data.summary,
          },
        },
        result.source,
      );
      const row = await repo.loadDecisionRun(id, workspace.business.id);
      record = row ? normalizeDecisionRow(row as unknown as Record<string, unknown>) : null;
    } catch {
      /* best-effort: the walkthrough still renders, it just won't be resumable */
    }
  }
  return { result, record };
}

/** Resume / advance a walkthrough: progress index, notes, or the final commit. */
export async function saveDecisionProgress(
  workspace: CoachWorkspace,
  id: string,
  patch: {
    progress?: number;
    notes?: Record<string, string>;
    status?: "open" | "decided" | "abandoned";
    decidedAt?: string;
  },
): Promise<DecisionRecord | null> {
  if (!workspace.business) return null;
  const steps: Record<string, unknown> = {};
  if (typeof patch.progress === "number") steps.progress = Math.max(0, Math.min(14, Math.round(patch.progress)));
  if (patch.notes) steps.notes = patch.notes;
  if (patch.decidedAt) steps.decidedAt = patch.decidedAt;
  const row = await repo.updateDecisionRun(id, workspace.business.id, { steps, status: patch.status });
  return row ? normalizeDecisionRow(row as unknown as Record<string, unknown>) : null;
}

/** Stored walkthroughs for the Decision Engine's history list. */
export async function loadDecisionHistory(workspace: CoachWorkspace): Promise<DecisionRecord[]> {
  if (!workspace.business) return [];
  try {
    const rows = await repo.loadDecisionRuns(workspace.business.id);
    return rows
      .map((row) => normalizeDecisionRow(row as unknown as Record<string, unknown>))
      .filter((row): row is DecisionRecord => row !== null);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Experiment tracker                                                  */
/* ------------------------------------------------------------------ */

/** Every experiment, newest first (running first is the UI's job, not the DB's). */
export async function listExperiments(workspace: CoachWorkspace): Promise<ExperimentRecord[]> {
  if (!workspace.business) return [];
  try {
    const rows = await repo.loadExperimentsFull(workspace.business.id);
    return rows.map((row) => normalizeExperimentRow(row as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function createExperiment(
  workspace: CoachWorkspace,
  input: ExperimentInput,
): Promise<ExperimentRecord | null> {
  if (!workspace.business) return null;
  const row = await repo.insertExperiment(workspace.business.id, {
    title: input.title.trim().slice(0, 200),
    hypothesis: clean(input.hypothesis),
    metric: clean(input.metric),
    status: input.status ?? "proposed",
    startedAt: input.startedAt ?? (input.status === "running" ? new Date().toISOString() : null),
    endedAt: input.endedAt ?? null,
    result: experimentResultBag(input),
  });
  return row ? normalizeExperimentRow(row as unknown as Record<string, unknown>) : null;
}

/**
 * Update an experiment. The `result` jsonb is merged field-by-field (a tracker
 * write of "learning" must not wipe the expected result captured at creation).
 */
export async function updateExperimentRun(
  workspace: CoachWorkspace,
  id: string,
  patch: Partial<ExperimentInput> & { outcome?: string | null; learning?: string | null; status?: ExperimentStatus },
): Promise<ExperimentRecord | null> {
  if (!workspace.business) return null;
  const existing = await repo.loadExperiment(id, workspace.business.id);
  if (!existing) return null;
  const current = normalizeExperimentRow(existing as unknown as Record<string, unknown>);
  const merged: Record<string, unknown> = {
    expectedResult: pick(patch.expectedResult, current.expectedResult),
    cost: pick(patch.cost, current.cost),
    timeRequired: pick(patch.timeRequired, current.timeRequired),
    failureThreshold: pick(patch.failureThreshold, current.failureThreshold),
    outcome: pick(patch.outcome, current.outcome),
    learning: pick(patch.learning, current.learning),
  };
  const status = patch.status ?? null;
  const row = await repo.updateExperiment(id, workspace.business.id, {
    title: clean(patch.title),
    hypothesis: patch.hypothesis === undefined ? undefined : clean(patch.hypothesis),
    metric: clean(patch.metric),
    status,
    startedAt:
      status === "running" && !current.startedAt ? new Date().toISOString() : (patch.startedAt ?? undefined),
    endedAt: status === "done" || status === "dropped" ? (patch.endedAt ?? current.endedAt ?? new Date().toISOString()) : (patch.endedAt ?? undefined),
    result: merged,
  });
  return row ? normalizeExperimentRow(row as unknown as Record<string, unknown>) : null;
}

/** Trim → 240-char text, or null when empty/absent. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 240) : null;
}

function pick(next: unknown, current: string | null): string | null {
  if (next === undefined) return current;
  return clean(typeof next === "string" ? next : null);
}

function experimentResultBag(input: ExperimentInput): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  for (const key of ["expectedResult", "cost", "timeRequired", "failureThreshold", "outcome", "learning"] as const) {
    const value = clean(input[key]);
    if (value) bag[key] = value;
  }
  return bag;
}

export async function getValidationPlan(
  workspace: CoachWorkspace,
  opts: RunCoachOptions = {},
): Promise<CoachResult<ValidationPlanData>> {
  return runCoach("validation_plan", workspace.context, opts);
}

/** Engine-only decision run (no persistence) — the tracker persists its own row. */
async function runDecisionGuidance(
  workspace: CoachWorkspace,
  input: { prompt: string; options?: string[]; criteria?: string[] },
  opts: RunCoachOptions = {},
): Promise<CoachResult<DecisionGuidanceData>> {
  const context: CoachContext = {
    ...workspace.context,
    input: input.prompt,
    options: input.options,
    criteria: input.criteria,
  };
  return runCoach("decision_guidance", context, opts);
}

export async function getDecisionGuidance(
  workspace: CoachWorkspace,
  input: { prompt: string; options?: string[]; criteria?: string[] },
  opts: RunCoachOptions = {},
): Promise<CoachResult<DecisionGuidanceData>> {
  const result = await runDecisionGuidance(workspace, input, opts);
  if (workspace.business) {
    try {
      await repo.insertDecision(workspace.business.id, result.data, result.source);
    } catch {
      /* best-effort */
    }
  }
  return result;
}

/** Guard used by every server fn that touches the database. */
export function coachReady(): boolean {
  return dbAvailable();
}
