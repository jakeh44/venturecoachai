/**
 * Agent registry — one agent per CoachIntent.
 *
 * Adding an intent means adding a file next to these and registering it here;
 * the engine needs no other change. Every agent ships a working
 * `deterministic()` implementation, which is why the product works with zero
 * LLM keys configured.
 */

import type { AnyCoachAgent, CoachIntent } from "../types";
import { bottleneckAgent } from "./bottleneck";
import { dailyPrioritiesAgent } from "./daily-priorities";
import { decisionGuidanceAgent } from "./decision-guidance";
import { ideaAnalysisAgent } from "./idea-analysis";
import { stageDetectionAgent } from "./stage-detection";
import { validationPlanAgent } from "./validation-plan";
import { weeklyPlanAgent } from "./weekly-plan";

export const AGENTS: Record<CoachIntent, AnyCoachAgent> = {
  daily_priorities: dailyPrioritiesAgent,
  bottleneck: bottleneckAgent,
  idea_analysis: ideaAnalysisAgent,
  validation_plan: validationPlanAgent,
  stage_detection: stageDetectionAgent,
  weekly_plan: weeklyPlanAgent,
  decision_guidance: decisionGuidanceAgent,
};

export const COACH_INTENTS = Object.keys(AGENTS) as CoachIntent[];

export function agentFor(intent: CoachIntent): AnyCoachAgent {
  return AGENTS[intent];
}

export {
  bottleneckAgent,
  dailyPrioritiesAgent,
  decisionGuidanceAgent,
  ideaAnalysisAgent,
  stageDetectionAgent,
  validationPlanAgent,
  weeklyPlanAgent,
};
