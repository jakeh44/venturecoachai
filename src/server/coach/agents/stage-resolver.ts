/**
 * stage-resolver.ts — one place that decides which stage the coach reasons
 * from, so every agent agrees.
 *
 * Order of authority:
 *   1. the stage persisted on coaching_state (set by the last detection run)
 *   2. the stage recorded on the business row
 *   3. a fresh milestone-based detection over the founder's facts
 *
 * Lives in its own module to keep the import graph acyclic (`bottleneck` and
 * `daily-priorities` need the stage, and stage-detection needs neither).
 */

import { stageBySlug, type Stage, type StageSlug } from "../stages";
import type { CoachContext } from "../types";
import { deterministicStageDetection } from "./stage-detection";

export function resolveStage(ctx: CoachContext): StageSlug {
  if (ctx.coaching?.currentStage) return stageBySlug(ctx.coaching.currentStage).slug;
  if (ctx.facts.stage) return stageBySlug(ctx.facts.stage).slug;
  return deterministicStageDetection(ctx).stage;
}

export function resolveStageInfo(ctx: CoachContext): Stage {
  return stageBySlug(resolveStage(ctx));
}
