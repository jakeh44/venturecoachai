/**
 * Coach engine — shared types (PART A).
 *
 * This module is PURE data/types only (no DB, no fetch, no node builtins) so it
 * is safe to import from both the server engine and client route components
 * (routes render stage labels, task shapes, etc.).
 *
 * Design rule for the whole engine: every intent has a working
 * `deterministic()` implementation, so the product is fully functional with
 * zero LLM keys. When `OPENAI_API_KEY` is present the LLM is tried first and
 * its output is validated; anything unusable silently falls back.
 */

import type { Feature } from "../plans";
import type { StageSlug } from "./stages";

/* ------------------------------------------------------------------ */
/* Intents & envelope                                                  */
/* ------------------------------------------------------------------ */

export type CoachIntent =
  | "daily_priorities"
  | "bottleneck"
  | "idea_analysis"
  | "validation_plan"
  | "stage_detection"
  | "weekly_plan"
  | "decision_guidance";

export type CoachSource = "llm" | "deterministic";

/** Every coach call returns this envelope — never a bare object. */
export interface CoachResult<T> {
  intent: CoachIntent;
  data: T;
  source: CoachSource;
  /** Present only when the LLM produced the answer. */
  model?: string;
  generatedAt: string;
  /** Set when the LLM was attempted and failed (ops/debug signal, safe to show). */
  degraded?: string;
  /** True when a usage limit blocked a fresh LLM-backed generation. */
  limited?: boolean;
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

/** Raw onboarding answers keyed by question slug (see product constants). */
export type FounderIntake = Record<string, string>;

/**
 * Normalized, machine-usable facts about the business.
 * Everything is nullable — the coach never invents a number it wasn't given;
 * unknown facts push the rule chain toward *finding out* rather than guessing.
 */
export interface BusinessFacts {
  name: string | null;
  description: string | null;
  /** Persisted stage (may be stale; stage_detection recomputes it). */
  stage: StageSlug | null;
  monthlyRevenue: number | null;
  customers: number | null;
  leadsPerMonth: number | null;
  /** 0..1 — share of qualified leads that become paying customers. */
  conversionRate: number | null;
  /** 0..1 — monthly logo/customer churn. */
  churnRate: number | null;
  /** 0..1 — how full the founder's delivery capacity is. */
  capacityUtilization: number | null;
  hoursPerWeek: number | null;
  incomeGoal: number | null;
  startupCapital: number | null;
  pricePoint: number | null;
  hasIdea: boolean;
  hasTargetCustomer: boolean;
  hasOffer: boolean;
  hasPayingCustomers: boolean;
  /** Count of real validation signals (interviews, pre-orders, pilots). */
  validationEvidence: number;
  documentedProcesses: number;
  teamSize: number;
  /** Free-text obstacle the founder self-reported (not always the true constraint). */
  selfReportedObstacle: string | null;
}

export interface CoachingStateSnapshot {
  currentStage: StageSlug;
  weeklyObjective: string | null;
  weeklyTopPriorities: string[];
  weeklyExperiment: unknown;
  dailyPriorities: unknown;
  healthScore: number | null;
  healthSnapshot: Record<string, unknown>;
  dailyCreatedAt?: string | null;
  weeklyCreatedAt?: string | null;
}

export interface CoachContext {
  userId: string | null;
  businessId: string | null;
  intake: FounderIntake;
  facts: BusinessFacts;
  coaching: CoachingStateSnapshot | null;
  /** Free-text input for intents that need it (decision prompt, etc.). */
  input?: string;
  /** Explicit decision options (Decision Engine). */
  options?: string[];
  /** Explicit weighted criteria (Decision Engine). */
  criteria?: string[];
  now: Date;
}

/** Fresh fact set — every unknown is `null`, every boolean false. */
export function emptyFacts(): BusinessFacts {
  return {
    name: null,
    description: null,
    stage: null,
    monthlyRevenue: null,
    customers: null,
    leadsPerMonth: null,
    conversionRate: null,
    churnRate: null,
    capacityUtilization: null,
    hoursPerWeek: null,
    incomeGoal: null,
    startupCapital: null,
    pricePoint: null,
    hasIdea: false,
    hasTargetCustomer: false,
    hasOffer: false,
    hasPayingCustomers: false,
    validationEvidence: 0,
    documentedProcesses: 0,
    teamSize: 0,
    selfReportedObstacle: null,
  };
}

/** Build a context with sane defaults so tests/seed paths stay terse. */
export function buildCoachContext(partial: Partial<CoachContext> = {}): CoachContext {
  return {
    userId: partial.userId ?? null,
    businessId: partial.businessId ?? null,
    intake: partial.intake ?? {},
    facts: partial.facts ?? emptyFacts(),
    coaching: partial.coaching ?? null,
    input: partial.input,
    options: partial.options,
    criteria: partial.criteria,
    now: partial.now ?? new Date(),
  };
}

/* ------------------------------------------------------------------ */
/* Shared output fragments                                             */
/* ------------------------------------------------------------------ */

export interface PriorityTask {
  title: string;
  why: string;
  estMinutes: number;
  doneWhen: string;
}

export interface MetricTarget {
  name: string;
  target: string;
  why?: string;
}

export interface CoachQuestion {
  coachingQuestion: string;
}

/* ------------------------------------------------------------------ */
/* Per-intent output shapes                                            */
/* ------------------------------------------------------------------ */

export interface DailyPrioritiesData {
  date: string;
  headline: string;
  objective: string;
  topTask: PriorityTask;
  second: PriorityTask;
  optional: PriorityTask | null;
  metric: MetricTarget;
  coachingQuestion: string;
  /** Anti-busywork guard: things NOT to do today and why. */
  avoid: { item: string; reason: string }[];
  focusNote: string;
}

export interface WeeklyPlanData {
  weekOf: string;
  objective: string;
  priorities: string[];
  actions: { title: string; doneWhen: string; effort: string }[];
  metrics: MetricTarget[];
  experiment: {
    title: string;
    hypothesis: string;
    metric: string;
    successThreshold: string;
    durationDays: number;
  };
  accountability: { commitment: string; checkIn: string; consequence: string };
  coachingQuestion: string;
  stageFocus: string;
}

export type BottleneckSeverity = "critical" | "high" | "medium";

export interface BottleneckData {
  /** Machine key for the rule that fired (stable, used for analytics). */
  slug: string;
  constraint: string;
  why: string;
  evidence: string[];
  nextAction: string;
  metricToWatch: MetricTarget;
  severity: BottleneckSeverity;
  /** The thing NOT to optimize until the constraint improves ("do not optimize Y"). */
  doNotOptimize: string;
  stage: StageSlug;
  improvesWhen: string;
  confidence: number;
  /** Signals we are missing to make this call sharper. */
  missingSignals: string[];
}

export interface StageMilestone {
  slug: StageSlug;
  label: string;
  achieved: boolean;
  evidence: string;
}

export interface StageDetectionData {
  stage: StageSlug;
  label: string;
  focus: string;
  index: number;
  total: number;
  progress: number;
  confidence: number;
  why: string;
  milestones: StageMilestone[];
  nextStage: StageSlug | null;
  nextMilestone: string;
}

export interface IdeaCategoryScore {
  key: string;
  label: string;
  /** 1..10, always oriented so 10 = best for the founder. */
  score: number;
  /** 0..1, all weights sum to 1. */
  weight: number;
  reason: string;
}

export interface ValidationStep {
  title: string;
  assumption: string;
  method: string;
  cost: string;
  timeframe: string;
  successSignal: string;
}

export interface IdeaAnalysisData {
  overallScore: number;
  grade: string;
  verdict: string;
  summary: string;
  categories: IdeaCategoryScore[];
  strengths: string[];
  risks: string[];
  knownAssumedUnknown: { known: string[]; assumed: string[]; unknown: string[] };
  validationPlan: ValidationStep[];
}

export interface ValidationPlanData {
  assumptions: { assumption: string; risk: "high" | "medium" | "low"; why: string }[];
  steps: ValidationStep[];
  totalCost: string;
  totalTime: string;
  killCriteria: string;
  summary: string;
}

export interface DecisionStep {
  n: number;
  name: string;
  question: string;
  guidance: string;
}

export interface DecisionOptionScore {
  label: string;
  score: number;
  weightedTotal: number;
  pros: string[];
  cons: string[];
  scores: { criterion: string; score: number }[];
}

export interface DecisionGuidanceData {
  prompt: string;
  doorType: "one_way_door" | "two_way_door";
  steps: DecisionStep[];
  criteria: { name: string; weight: number; why: string }[];
  options: DecisionOptionScore[];
  recommendation: {
    choice: string;
    confidence: number;
    why: string;
    risks: string[];
    firstStep: string;
    reversesIf: string;
  } | null;
  whyNot: { option: string; reason: string }[];
  summary: string;
}

/** Generic map of intent → data, so the engine can stay type-agnostic internally. */
export interface CoachDataMap {
  daily_priorities: DailyPrioritiesData;
  bottleneck: BottleneckData;
  idea_analysis: IdeaAnalysisData;
  validation_plan: ValidationPlanData;
  stage_detection: StageDetectionData;
  weekly_plan: WeeklyPlanData;
  decision_guidance: DecisionGuidanceData;
}

/* ------------------------------------------------------------------ */
/* Persisted artifacts (tracker / analyzer history / decision runs)     */
/* ------------------------------------------------------------------ */

/**
 * A stored idea analysis, shaped for the analyzer's history list — it carries
 * the whole artifact so re-viewing a past analysis needs no extra round trip.
 * `normalizeIdeaAnalysisRow` reads the row's `scores` jsonb, which holds the
 * overall score + categories and stashes the title/grade/verdict the founder saw.
 */
export interface IdeaAnalysisRecord {
  id: string;
  title: string | null;
  createdAt: string | null;
  source: CoachSource;
  overallScore: number;
  grade: string | null;
  verdict: string | null;
  summary: string | null;
  categories: IdeaCategoryScore[];
  knownAssumedUnknown: { known: string[]; assumed: string[]; unknown: string[] };
  validationPlan: ValidationStep[];
}

/** One option as the founder typed it into the Decision Engine form. */
export interface DecisionOptionInput {
  label: string;
  pros: string;
  cons: string;
}

/** The Idea Analyzer's form input. */
export interface IdeaAnalysisInput {
  title: string;
  description: string;
  targetCustomer?: string;
  alternative?: string;
  priceRange?: string;
}

/** The Decision Engine's "start a decision" input. */
export interface DecisionStartInput {
  title: string;
  context?: string;
  options: DecisionOptionInput[];
}

/** The Experiment tracker's create/update input. */
export interface ExperimentInput {
  title: string;
  hypothesis?: string | null;
  metric?: string | null;
  expectedResult?: string | null;
  cost?: string | null;
  timeRequired?: string | null;
  failureThreshold?: string | null;
  outcome?: string | null;
  learning?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  status?: ExperimentStatus;
}

/**
 * A stored decision walkthrough. The rows keep the 14-step framework plus how
 * far the founder got (`progress`) and their per-step notes, so a walkthrough
 * can be resumed in a later session.
 */
export interface DecisionRecord {
  id: string;
  prompt: string;
  status: "open" | "decided" | "abandoned";
  createdAt: string | null;
  updatedAt: string | null;
  doorType: DecisionGuidanceData["doorType"] | null;
  summary: string | null;
  options: DecisionOptionScore[];
  criteria: { name: string; weight: number; why: string }[];
  steps: DecisionStep[];
  recommendation: DecisionGuidanceData["recommendation"];
  /** 0-based index of the step the founder last sat on ("14" = final view). */
  progress: number;
  notes: Record<string, string>;
  /** The founder's own option notes (pros/cons) — shown beside the scored options. */
  input: DecisionOptionInput[];
}

export type ExperimentStatus = "proposed" | "running" | "done" | "dropped";

/**
 * A stored experiment, shaped for the tracker. The dashboard's
 * `DashboardExperiment` fields (title / hypothesis / metric / status /
 * startedAt) come from columns so both surfaces agree; the tracker's extra
 * fields live inside the row's `result` jsonb.
 */
export interface ExperimentRecord {
  id: string;
  title: string;
  hypothesis: string | null;
  metric: string | null;
  status: ExperimentStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expectedResult: string | null;
  cost: string | null;
  timeRequired: string | null;
  failureThreshold: string | null;
  outcome: string | null;
  learning: string | null;
}

/* ------------------------------------------------------------------ */
/* Row normalizers (pure: jsonb in, typed record out)                  */
/* ------------------------------------------------------------------ */

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function experimentStatus(value: unknown): ExperimentStatus {
  return value === "running" || value === "done" || value === "dropped" ? value : "proposed";
}

export function normalizeExperimentRow(row: Record<string, unknown>): ExperimentRecord {
  const result = asObject(row.result);
  return {
    id: String(row.id ?? ""),
    title: text(row.title) ?? "Untitled experiment",
    hypothesis: text(row.hypothesis),
    metric: text(row.metric),
    status: experimentStatus(row.status),
    startedAt: text(row.started_at),
    endedAt: text(row.ended_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    expectedResult: text(result.expectedResult),
    cost: text(result.cost),
    timeRequired: text(result.timeRequired),
    failureThreshold: text(result.failureThreshold),
    outcome: text(result.outcome),
    learning: text(result.learning),
  };
}

/** Null when the row is too broken to render (never throws). */
export function normalizeIdeaAnalysisRow(row: Record<string, unknown>): IdeaAnalysisRecord | null {
  const scores = asObject(row.scores);
  const categories = Array.isArray(scores.categories)
    ? (scores.categories as IdeaCategoryScore[]).filter(
        (entry) => entry && typeof entry === "object" && typeof entry.score === "number",
      )
    : [];
  const overall = num(scores.overallScore, 0);
  if (categories.length === 0 && overall <= 0) return null;
  const split = asObject(row.known_assumed_unknown);
  return {
    id: String(row.id ?? ""),
    title: text(scores.title),
    createdAt: text(row.created_at),
    source: row.source === "llm" ? "llm" : "deterministic",
    overallScore: overall,
    grade: text(scores.grade),
    verdict: text(scores.verdict),
    summary: text(row.summary),
    categories,
    knownAssumedUnknown: {
      known: textArray(split.known),
      assumed: textArray(split.assumed),
      unknown: textArray(split.unknown),
    },
    validationPlan: Array.isArray(row.validation_plan)
      ? (row.validation_plan as ValidationStep[]).filter((step) => step && typeof step === "object")
      : [],
  };
}

/**
 * Normalizes a decision row. `steps` is a bag (`{ items, progress, notes }`) for
 * runs created by the tracker; legacy rows written by `insertDecision` hold a
 * bare array, which is tolerated here so nothing in the history breaks.
 */
export function normalizeDecisionRow(row: Record<string, unknown>): DecisionRecord | null {
  const bag = asObject(row.steps);
  const steps: DecisionStep[] = Array.isArray(row.steps)
    ? (row.steps as DecisionStep[])
    : Array.isArray(bag.items)
      ? (bag.items as DecisionStep[])
      : [];
  if (steps.length === 0) return null;
  const notes = asObject(bag.notes);
  const cleanNotes: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    const note = text(value);
    if (note) cleanNotes[key] = note;
  }
  const recBag = asObject(row.recommendation);
  const recommendation =
    recBag.choice !== undefined && typeof recBag.choice === "string"
      ? (recBag as unknown as DecisionGuidanceData["recommendation"])
      : null;
  const optionsBag = asObject(row.options);
  const scored = Array.isArray(row.options)
    ? (row.options as DecisionOptionScore[])
    : Array.isArray(optionsBag.scored)
      ? (optionsBag.scored as DecisionOptionScore[])
      : [];
  const input = Array.isArray(optionsBag.input)
    ? (optionsBag.input as Record<string, unknown>[]).map((entry) => ({
        label: text(entry.label) ?? "",
        pros: text(entry.pros) ?? "",
        cons: text(entry.cons) ?? "",
      }))
    : [];
  const doorType = recBag.doorType === "one_way_door" || recBag.doorType === "two_way_door" ? recBag.doorType : null;
  const status = row.status === "decided" || row.status === "abandoned" ? row.status : "open";
  return {
    id: String(row.id ?? ""),
    prompt: text(row.prompt) ?? "Untitled decision",
    status,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    doorType,
    summary: text(recBag.summary),
    options: scored,
    criteria: Array.isArray(row.criteria)
      ? (row.criteria as { name: string; weight: number; why: string }[])
      : [],
    steps,
    recommendation,
    progress: Math.max(0, Math.min(steps.length, Math.round(num(bag.progress, 0)))),
    notes: cleanNotes,
    input,
  };
}

/* ------------------------------------------------------------------ */
/* Agent contract                                                      */
/* ------------------------------------------------------------------ */

export interface CoachPrompt {
  system: string;
  user: string;
}

/**
 * One agent per intent. `validate` must throw (never return junk) when the LLM
 * payload is unusable — the engine catches that and falls back to
 * `deterministic`, which must always produce a genuinely useful answer.
 */
export interface CoachAgent<K extends CoachIntent> {
  intent: K;
  label: string;
  /** Usage feature to meter, or null for internal/derived intents. */
  feature: Feature | null;
  buildPrompt(ctx: CoachContext): CoachPrompt;
  validate(raw: unknown, ctx: CoachContext): CoachDataMap[K];
  deterministic(ctx: CoachContext): CoachDataMap[K];
}

export type AnyCoachAgent = CoachAgent<CoachIntent>;
