/**
 * server.ts — the coach engine's server functions (the public RPC surface).
 *
 * Contracts (team-settled):
 * - handlers return PLAIN JSON objects, never Response
 * - the session is resolved with sessionUser() and missing-session is reported
 *   as data (`{ ok: false, reason: "unauthorized" }`), never a thrown redirect
 *   (the /_app layout's beforeLoad owns redirects)
 * - without a database every fn reports `{ ok: false, reason: "setup" }` so the
 *   UI can show the graceful banner instead of crashing
 * - generous responses are cached in the database by the service layer, so the
 *   dashboard costs one round trip and the Free plan's caps stay real
 */

import { createServerFn } from "@tanstack/react-start";
import { sessionUser } from "../auth/server";
import { dbAvailable } from "../env";
import { llmAvailable, coachModel } from "./llm";
import * as service from "./service";
import type { HealthScore } from "./health";
import type {
  BottleneckData,
  CoachResult,
  DailyPrioritiesData,
  DecisionGuidanceData,
  DecisionOptionInput,
  DecisionRecord,
  DecisionStartInput,
  ExperimentInput,
  ExperimentRecord,
  ExperimentStatus,
  IdeaAnalysisData,
  IdeaAnalysisInput,
  IdeaAnalysisRecord,
  StageDetectionData,
  ValidationPlanData,
  WeeklyPlanData,
} from "./types";

/* ------------------------------------------------------------------ */
/* Payloads                                                            */
/* ------------------------------------------------------------------ */

export interface DashboardBusiness {
  id: string;
  name: string;
  description: string | null;
  stage: string | null;
}

export interface DashboardExperiment {
  id: string;
  title: string;
  hypothesis: string | null;
  metric: string | null;
  status: string;
  startedAt: string | null;
}

export interface DashboardPayload {
  ok: true;
  /** False when the database is connected; true = accounts/coaching disabled. */
  setup: boolean;
  hasBusiness: boolean;
  plan: string;
  founderName: string | null;
  business: DashboardBusiness | null;
  stage: CoachResult<StageDetectionData> | null;
  health: HealthScore | null;
  bottleneck: CoachResult<BottleneckData> | null;
  daily: CoachResult<DailyPrioritiesData> | null;
  weekly: CoachResult<WeeklyPlanData> | null;
  experiments: DashboardExperiment[];
  /** Which brain produced this session — shown as a small badge in the UI. */
  brain: { llm: boolean; model: string | null };
}

export type CoachUnavailable = {
  ok: false;
  reason: "setup" | "unauthorized" | "no_business";
};

export type DashboardResult = DashboardPayload | CoachUnavailable;
export type CoachReply<T> = { ok: true; result: CoachResult<T> } | CoachUnavailable;

type Ready = { ok: true; userId: string; workspace: service.CoachWorkspace };

/** Resolve session + database + business, or explain why coaching is off. */
async function ready(): Promise<Ready | CoachUnavailable> {
  const user = await sessionUser();
  if (!user) return { ok: false, reason: "unauthorized" };
  if (!dbAvailable()) return { ok: false, reason: "setup" };
  const workspace = await service.loadWorkspace(user.id);
  if (!workspace.hasBusiness) return { ok: false, reason: "no_business" };
  return { ok: true, userId: user.id, workspace };
}

function unavailable(value: Ready | CoachUnavailable): value is CoachUnavailable {
  return value.ok === false;
}

/* ------------------------------------------------------------------ */
/* Dashboard aggregate                                                 */
/* ------------------------------------------------------------------ */

/**
 * Everything the dashboard renders, in one round trip: stage (+10-stage
 * progress), health scorecard, the binding constraint, today's priorities and
 * this week's plan. With no business it returns `hasBusiness: false` so the
 * dashboard can prompt for onboarding.
 */
export const getDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardResult> => {
    const user = await sessionUser();
    if (!user) return { ok: false, reason: "unauthorized" };
    if (!dbAvailable()) return { ok: false, reason: "setup" };

    const workspace = await service.loadWorkspace(user.id);
    const brain = { llm: llmAvailable(), model: llmAvailable() ? coachModel() : null };

    if (!workspace.hasBusiness) {
      return {
        ok: true,
        setup: false,
        hasBusiness: false,
        plan: user.plan,
        founderName: user.name,
        business: null,
        stage: null,
        health: null,
        bottleneck: null,
        daily: null,
        weekly: null,
        experiments: [],
        brain,
      };
    }

    // Detect the stage first, then re-derive the workspace from it so every
    // downstream agent reasons from the same stage.
    const stage = await service.getStage(workspace);
    const current = service.withStage(workspace, stage.data.stage);
    const bottleneck = await service.getBottleneck(current);
    const daily = await service.getDailyPriorities(current);
    const weekly = await service.getWeeklyPlan(current);

    return {
      ok: true,
      setup: false,
      hasBusiness: true,
      plan: user.plan,
      founderName: user.name,
      business: {
        id: workspace.business?.id ?? "",
        name: workspace.business?.name ?? "My business",
        description: workspace.business?.description ?? null,
        stage: stage.data.stage,
      },
      stage,
      health: current.health,
      bottleneck,
      daily,
      weekly,
      experiments: workspace.experiments.map((row) => ({
        id: row.id,
        title: row.title,
        hypothesis: row.hypothesis,
        metric: row.metric,
        status: row.status,
        startedAt: row.started_at,
      })),
      brain: { llm: llmAvailable(), model: llmAvailable() ? coachModel() : null },
    };
  },
);

/* ------------------------------------------------------------------ */
/* Individual intents                                                  */
/* ------------------------------------------------------------------ */

export const coachStage = createServerFn({ method: "GET" }).handler(
  async (): Promise<CoachReply<StageDetectionData>> => {
    const state = await ready();
    if (unavailable(state)) return state;
    return { ok: true, result: await service.getStage(state.workspace) };
  },
);

export interface RegenerateInput {
  regenerate?: boolean;
}

export const coachBottleneck = createServerFn({ method: "POST" })
  .validator((data: unknown): RegenerateInput => (data ?? {}) as RegenerateInput)
  .handler(async ({ data }): Promise<CoachReply<BottleneckData>> => {
    const state = await ready();
    if (unavailable(state)) return state;
    return {
      ok: true,
      result: await service.getBottleneck(state.workspace, { regenerate: data.regenerate === true }),
    };
  });

export const coachDailyPriorities = createServerFn({ method: "POST" })
  .validator((data: unknown): RegenerateInput => (data ?? {}) as RegenerateInput)
  .handler(async ({ data }): Promise<CoachReply<DailyPrioritiesData>> => {
    const state = await ready();
    if (unavailable(state)) return state;
    return {
      ok: true,
      result: await service.getDailyPriorities(state.workspace, { regenerate: data.regenerate === true }),
    };
  });

export const coachWeeklyPlan = createServerFn({ method: "POST" })
  .validator((data: unknown): RegenerateInput => (data ?? {}) as RegenerateInput)
  .handler(async ({ data }): Promise<CoachReply<WeeklyPlanData>> => {
    const state = await ready();
    if (unavailable(state)) return state;
    return {
      ok: true,
      result: await service.getWeeklyPlan(state.workspace, { regenerate: data.regenerate === true }),
    };
  });

export const coachIdeaAnalysis = createServerFn({ method: "POST" }).handler(
  async (): Promise<CoachReply<IdeaAnalysisData>> => {
    const state = await ready();
    if (unavailable(state)) return state;
    const { result } = await service.getIdeaAnalysis(state.workspace);
    return { ok: true, result };
  },
);

export const coachValidationPlan = createServerFn({ method: "POST" }).handler(
  async (): Promise<CoachReply<ValidationPlanData>> => {
    const state = await ready();
    if (unavailable(state)) return state;
    return { ok: true, result: await service.getValidationPlan(state.workspace) };
  },
);

export interface DecisionInput {
  prompt: string;
  options?: string[];
  criteria?: string[];
}

export const coachDecisionGuidance = createServerFn({ method: "POST" })
  .validator((data: unknown): DecisionInput => {
    const input = (data ?? {}) as DecisionInput;
    return {
      prompt: typeof input.prompt === "string" ? input.prompt.slice(0, 2000) : "",
      options: Array.isArray(input.options) ? input.options.slice(0, 6).map(String) : undefined,
      criteria: Array.isArray(input.criteria) ? input.criteria.slice(0, 8).map(String) : undefined,
    };
  })
  .handler(async ({ data }): Promise<CoachReply<DecisionGuidanceData>> => {
    const state = await ready();
    if (unavailable(state)) return state;
    return {
      ok: true,
      result: await service.getDecisionGuidance(state.workspace, {
        prompt: data.prompt,
        options: data.options,
        criteria: data.criteria,
      }),
    };
  });

/* ------------------------------------------------------------------ */
/* Founder tools: Idea Analyzer, Decision Engine, Experiment tracker   */
/* ------------------------------------------------------------------ */

/**
 * Tool pages resolve session + database, but a missing business is DATA (so the
 * page can prompt for onboarding) rather than an error — unlike `ready()`,
 * which reports it as `no_business` for the coaching intents.
 */
type ToolContext = { ok: true; userId: string; workspace: service.CoachWorkspace } | CoachUnavailable;

async function toolContext(): Promise<ToolContext> {
  const user = await sessionUser();
  if (!user) return { ok: false, reason: "unauthorized" };
  if (!dbAvailable()) return { ok: false, reason: "setup" };
  const workspace = await service.loadWorkspace(user.id);
  return { ok: true, userId: user.id, workspace };
}

function isUnavailable(value: ToolContext): value is CoachUnavailable {
  return value.ok === false;
}

interface ToolBusiness {
  id: string;
  name: string;
  description: string | null;
}

/* --- Idea Analyzer ------------------------------------------------- */

export interface IdeaAnalyzerPayload {
  ok: true;
  hasBusiness: boolean;
  plan: string;
  founderName: string | null;
  business: ToolBusiness | null;
  /** Past analyses, newest first — the whole artifact, so re-viewing is local. */
  history: IdeaAnalysisRecord[];
  brain: { llm: boolean; model: string | null };
}

export type IdeaAnalyzerResult = IdeaAnalyzerPayload | CoachUnavailable;
export type AnalyzeIdeaReply =
  | { ok: true; result: CoachResult<IdeaAnalysisData>; record: IdeaAnalysisRecord | null }
  | CoachUnavailable;

export const getIdeaAnalyzer = createServerFn({ method: "GET" }).handler(
  async (): Promise<IdeaAnalyzerResult> => {
    const user = await sessionUser();
    if (!user) return { ok: false, reason: "unauthorized" };
    if (!dbAvailable()) return { ok: false, reason: "setup" };
    const workspace = await service.loadWorkspace(user.id);
    const history = workspace.hasBusiness ? await service.loadIdeaAnalysisHistory(workspace) : [];
    return {
      ok: true,
      hasBusiness: workspace.hasBusiness,
      plan: user.plan,
      founderName: user.name,
      business: workspace.business
        ? {
            id: workspace.business.id,
            name: workspace.business.name,
            description: workspace.business.description,
          }
        : null,
      history,
      brain: { llm: llmAvailable(), model: llmAvailable() ? coachModel() : null },
    };
  },
);

export const analyzeIdea = createServerFn({ method: "POST" })
  .validator((data: unknown): IdeaAnalysisInput => {
    const input = (data ?? {}) as Partial<IdeaAnalysisInput>;
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
    return {
      title: text(input.title, 200),
      description: text(input.description, 4000),
      targetCustomer: text(input.targetCustomer, 400),
      alternative: text(input.alternative, 400),
      priceRange: text(input.priceRange, 120),
    };
  })
  .handler(async ({ data }): Promise<AnalyzeIdeaReply> => {
    const state = await toolContext();
    if (isUnavailable(state)) return state;
    if (!state.workspace.hasBusiness) return { ok: false, reason: "no_business" };
    if (data.title.trim().length === 0 && data.description.trim().length === 0) {
      return { ok: false, reason: "no_business" };
    }
    const { result, record } = await service.getIdeaAnalysis(state.workspace, { input: data });
    return { ok: true, result, record };
  });

/* --- Decision Engine ----------------------------------------------- */

export interface DecisionPayload {
  ok: true;
  hasBusiness: boolean;
  plan: string;
  business: ToolBusiness | null;
  /** Stored walkthroughs (open first, then decided), so they can be resumed. */
  history: DecisionRecord[];
  brain: { llm: boolean; model: string | null };
}

export type DecisionPageResult = DecisionPayload | CoachUnavailable;
export type StartDecisionReply =
  | { ok: true; result: CoachResult<DecisionGuidanceData>; record: DecisionRecord | null }
  | CoachUnavailable;
export type DecisionProgressReply = { ok: true; record: DecisionRecord | null } | CoachUnavailable;

export const getDecisionEngine = createServerFn({ method: "GET" }).handler(
  async (): Promise<DecisionPageResult> => {
    const user = await sessionUser();
    if (!user) return { ok: false, reason: "unauthorized" };
    if (!dbAvailable()) return { ok: false, reason: "setup" };
    const workspace = await service.loadWorkspace(user.id);
    const history = workspace.hasBusiness ? await service.loadDecisionHistory(workspace) : [];
    history.sort((a, b) => {
      const rank = (status: DecisionRecord["status"]) => (status === "open" ? 0 : 1);
      return rank(a.status) - rank(b.status) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
    return {
      ok: true,
      hasBusiness: workspace.hasBusiness,
      plan: user.plan,
      business: workspace.business
        ? {
            id: workspace.business.id,
            name: workspace.business.name,
            description: workspace.business.description,
          }
        : null,
      history,
      brain: { llm: llmAvailable(), model: llmAvailable() ? coachModel() : null },
    };
  },
);

export const startDecision = createServerFn({ method: "POST" })
  .validator((data: unknown): DecisionStartInput => {
    const input = (data ?? {}) as Partial<DecisionStartInput>;
    const options = Array.isArray(input.options) ? input.options.slice(0, 5) : [];
    return {
      title: typeof input.title === "string" ? input.title.slice(0, 300) : "",
      context: typeof input.context === "string" ? input.context.slice(0, 2000) : "",
      options: options.map((option) => {
        const entry = (option ?? {}) as Partial<DecisionOptionInput>;
        return {
          label: typeof entry.label === "string" ? entry.label.slice(0, 140) : "",
          pros: typeof entry.pros === "string" ? entry.pros.slice(0, 400) : "",
          cons: typeof entry.cons === "string" ? entry.cons.slice(0, 400) : "",
        };
      }),
    };
  })
  .handler(async ({ data }): Promise<StartDecisionReply> => {
    const state = await toolContext();
    if (isUnavailable(state)) return state;
    if (!state.workspace.hasBusiness) return { ok: false, reason: "no_business" };
    const options = data.options.filter((option) => option.label.trim().length > 0);
    if (data.title.trim().length === 0 || options.length < 2) return { ok: false, reason: "no_business" };
    const { result, record } = await service.startDecisionRun(state.workspace, { ...data, options });
    return { ok: true, result, record };
  });

export const saveDecisionStep = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const input = (data ?? {}) as {
      id?: string;
      progress?: number;
      notes?: Record<string, string>;
      status?: string;
    };
    const notes: Record<string, string> = {};
    if (input.notes && typeof input.notes === "object") {
      for (const [key, value] of Object.entries(input.notes).slice(0, 20)) {
        if (typeof value === "string" && value.trim().length > 0) notes[key.slice(0, 40)] = value.slice(0, 1200);
      }
    }
    return {
      id: typeof input.id === "string" ? input.id : "",
      progress: typeof input.progress === "number" ? input.progress : undefined,
      notes,
      status:
        input.status === "decided" || input.status === "abandoned" || input.status === "open"
          ? (input.status as "open" | "decided" | "abandoned")
          : undefined,
    };
  })
  .handler(async ({ data }): Promise<DecisionProgressReply> => {
    const state = await toolContext();
    if (isUnavailable(state)) return state;
    if (!state.workspace.hasBusiness || !data.id) return { ok: false, reason: "no_business" };
    const record = await service.saveDecisionProgress(state.workspace, data.id, {
      progress: data.progress,
      notes: Object.keys(data.notes).length > 0 ? data.notes : undefined,
      status: data.status,
      decidedAt: data.status === "decided" ? new Date().toISOString() : undefined,
    });
    return { ok: true, record };
  });

/* --- Experiment tracker -------------------------------------------- */

export interface ExperimentsPayload {
  ok: true;
  hasBusiness: boolean;
  plan: string;
  business: ToolBusiness | null;
  experiments: ExperimentRecord[];
  brain: { llm: boolean; model: string | null };
}

export type ExperimentsResult = ExperimentsPayload | CoachUnavailable;
export type ExperimentReply =
  | { ok: true; experiment: ExperimentRecord | null }
  | CoachUnavailable;

const EXPERIMENT_STATUSES: ExperimentStatus[] = ["proposed", "running", "done", "dropped"];

function readExperimentInput(value: unknown, requireTitle: boolean): ExperimentInput | null {
  const input = (value ?? {}) as Partial<ExperimentInput> & { status?: unknown; id?: unknown };
  // Empty / whitespace-only strings become null: a blank date input must not
  // reach Postgres as `''::timestamptz`, and a blank text field must not wipe a
  // value on update (the repository's coalesce keeps the existing column).
  const text = (field: unknown, max = 400) => {
    if (typeof field !== "string") return null;
    const trimmed = field.trim();
    return trimmed.length > 0 ? trimmed.slice(0, max) : null;
  };
  const title = text(input.title, 200);
  if (requireTitle && (!title || title.trim().length === 0)) return null;
  const status = EXPERIMENT_STATUSES.includes(input.status as ExperimentStatus)
    ? (input.status as ExperimentStatus)
    : undefined;
  return {
    title: title ?? "",
    hypothesis: text(input.hypothesis, 1200),
    metric: text(input.metric, 300),
    expectedResult: text(input.expectedResult, 600),
    cost: text(input.cost, 120),
    timeRequired: text(input.timeRequired, 120),
    failureThreshold: text(input.failureThreshold, 600),
    outcome: text(input.outcome, 1200),
    learning: text(input.learning, 1200),
    startedAt: text(input.startedAt, 40),
    endedAt: text(input.endedAt, 40),
    status,
  };
}

export const getExperiments = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExperimentsResult> => {
    const user = await sessionUser();
    if (!user) return { ok: false, reason: "unauthorized" };
    if (!dbAvailable()) return { ok: false, reason: "setup" };
    const workspace = await service.loadWorkspace(user.id);
    const experiments = workspace.hasBusiness ? await service.listExperiments(workspace) : [];
    return {
      ok: true,
      hasBusiness: workspace.hasBusiness,
      plan: user.plan,
      business: workspace.business
        ? {
            id: workspace.business.id,
            name: workspace.business.name,
            description: workspace.business.description,
          }
        : null,
      experiments,
      brain: { llm: llmAvailable(), model: llmAvailable() ? coachModel() : null },
    };
  },
);

export const createExperiment = createServerFn({ method: "POST" })
  .validator((data: unknown): ExperimentInput | null => readExperimentInput(data, true))
  .handler(async ({ data }): Promise<ExperimentReply> => {
    const state = await toolContext();
    if (isUnavailable(state)) return state;
    if (!state.workspace.hasBusiness || !data) return { ok: false, reason: "no_business" };
    const experiment = await service.createExperiment(state.workspace, {
      ...data,
      startedAt: data.status === "running" ? (data.startedAt ?? new Date().toISOString()) : data.startedAt,
    });
    return { ok: true, experiment };
  });

export const updateExperiment = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const input = (data ?? {}) as { id?: string };
    return {
      id: typeof input.id === "string" ? input.id : "",
      patch: readExperimentInput(data, false),
    };
  })
  .handler(async ({ data }): Promise<ExperimentReply> => {
    const state = await toolContext();
    if (isUnavailable(state)) return state;
    if (!state.workspace.hasBusiness || !data.id || !data.patch) return { ok: false, reason: "no_business" };
    const experiment = await service.updateExperimentRun(state.workspace, data.id, data.patch);
    return { ok: true, experiment };
  });
