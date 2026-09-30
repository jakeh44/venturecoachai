/**
 * onboarding/server.ts — the wizard's server functions.
 *
 * Completing onboarding is the moment the product becomes useful: we create the
 * user's business, store the founder profile (Business memory), detect the
 * stage from the answers, find the first constraint, compute the health score,
 * and seed `coaching_state`. Everything runs deterministically and offline
 * (no LLM latency on a 17-step submit) — the LLM only ever refines later.
 */

import { createServerFn } from "@tanstack/react-start";
import { sessionUser } from "../auth/server";
import { dbAvailable } from "../env";
import { runCoachOffline } from "../coach/engine";
import { computeHealthScore } from "../coach/health";
import { businessNameFromIntake, deriveFacts, tidy } from "../coach/intake";
import { saveOnboarding } from "../coach/repository";
import { buildCoachContext, emptyFacts, type BusinessFacts, type FounderIntake } from "../coach/types";
import { loadWorkspace } from "../coach/service";
import { ONBOARDING_QUESTIONS } from "./questions";

export interface OnboardingState {
  setup: boolean;
  hasBusiness: boolean;
  founderName: string | null;
  /** Previously saved answers, so re-running the wizard edits instead of duplicating. */
  answers: FounderIntake;
  completed: boolean;
}

export type OnboardingResult =
  | { ok: true; businessId: string; stage: string; constraint: string }
  | { ok: false; reason: "setup" | "unauthorized" | "invalid"; message?: string };

/** Current wizard state for the signed-in user. */
export const getOnboardingState = createServerFn({ method: "GET" }).handler(
  async (): Promise<OnboardingState> => {
    const user = await sessionUser();
    const empty: OnboardingState = {
      setup: !dbAvailable(),
      hasBusiness: false,
      founderName: user?.name ?? null,
      answers: {},
      completed: false,
    };
    if (!user || !dbAvailable()) return empty;
    try {
      const workspace = await loadWorkspace(user.id);
      return {
        setup: false,
        hasBusiness: workspace.hasBusiness,
        founderName: user.name,
        answers: workspace.intake,
        completed: Object.keys(workspace.intake ?? {}).length >= 12,
      };
    } catch {
      return empty;
    }
  },
);

/** Keep only known slugs, trimmed and bounded. */
function sanitizeAnswers(raw: unknown): FounderIntake {
  const source = (raw ?? {}) as Record<string, unknown>;
  const answers: FounderIntake = {};
  for (const question of ONBOARDING_QUESTIONS) {
    const value = source[question.slug];
    answers[question.slug] = typeof value === "string" ? tidy(value).slice(0, 2000) : "";
  }
  return answers;
}

export const submitOnboarding = createServerFn({ method: "POST" })
  .validator((data: unknown): { answers: Record<string, string> } => ({
    answers: ((data ?? {}) as { answers?: Record<string, string> }).answers ?? {},
  }))
  .handler(async ({ data }): Promise<OnboardingResult> => {
    const user = await sessionUser();
    if (!user) return { ok: false, reason: "unauthorized" };
    if (!dbAvailable()) return { ok: false, reason: "setup" };

    const answers = sanitizeAnswers(data.answers);
    const answered = Object.values(answers).filter((value) => value.length > 0).length;
    if (answered < 12) {
      return {
        ok: false,
        reason: "invalid",
        message: "Please answer at least 12 of the 17 questions — the coach needs real inputs.",
      };
    }

    const founderName = answers.name ? answers.name.slice(0, 120) : null;
    // `deriveFacts` returns every key it can derive (null = genuinely unknown,
    // 0 = pre-revenue), so it spreads over the empty defaults without loss.
    const facts: BusinessFacts = { ...emptyFacts(), ...deriveFacts(answers) };
    const baseContext = buildCoachContext({ userId: user.id, intake: answers, facts });

    // Deterministic, offline: stage → constraint → health. These seed coaching_state.
    const stageResult = await runCoachOffline("stage_detection", baseContext);
    const stage = stageResult.data.stage;
    const context = { ...baseContext, facts: { ...facts, stage } };
    const bottleneckResult = await runCoachOffline("bottleneck", context);
    const health = computeHealthScore(context);

    const businessId = await saveOnboarding({
      userId: user.id,
      founderName,
      businessName: businessNameFromIntake(answers, "My business"),
      description: facts.description ?? null,
      intake: answers,
      profile: {
        founderName,
        facts,
        ambition: answers.ambition ?? null,
        businessModel: answers.business_model ?? null,
        occupied: answers.occupation ?? null,
        timeline: answers.timeline ?? null,
        riskTolerance: answers.risk_tolerance ?? null,
      },
      stage,
      healthScore: health.score,
      healthSnapshot: {
        facts,
        stage: { slug: stage, at: stageResult.generatedAt, source: stageResult.source, why: stageResult.data.why },
        bottleneck: bottleneckResult,
        constraint: bottleneckResult.data.constraint,
        health: {
          score: health.score,
          band: health.band,
          components: health.components,
          headline: health.headline,
        },
        onboarding: { completedAt: new Date().toISOString(), answered },
      },
    });

    return { ok: true, businessId, stage, constraint: bottleneckResult.data.constraint };
  });
