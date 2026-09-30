/**
 * engine.ts — the single entry point for every coaching intent.
 *
 * Contract:
 *   runCoach(intent, ctx, opts) ALWAYS resolves with a valid `CoachResult`.
 *   1. If an API key is present (and LLM is not disabled), build the prompt,
 *      call the model, and validate its JSON.
 *   2. Any failure at all (no key, HTTP error, timeout, unparseable or
 *      incomplete JSON) falls back to the agent's deterministic output and
 *      records why in `degraded`.
 *   3. Usage is recorded through src/server/usage.ts (best-effort: a missing
 *      database or a reached cap never breaks a coaching call — `limited` is
 *      set instead).
 */

import { dbAvailable } from "../env";
import type { Feature } from "../plans";
import { enforceAndRecord } from "../usage";
import { AGENTS } from "./agents";
import { coachModel, llmAvailable, llmJSON } from "./llm";
import type { CoachAgent, CoachContext, CoachDataMap, CoachIntent, CoachResult } from "./types";

export interface RunCoachOptions {
  /** Set false to force the deterministic path (onboarding seeding, tests). */
  allowLlm?: boolean;
  /** Set false to skip the usage ledger (pure previews / offline checks). */
  recordUsage?: boolean;
}

function shortMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 160);
}

/** Run an agent's deterministic path; a throw here is a programming bug. */
function deterministic<K extends CoachIntent>(
  agent: CoachAgent<K>,
  ctx: CoachContext,
): CoachDataMap[K] {
  try {
    return agent.deterministic(ctx);
  } catch (error) {
    throw new Error(`coach_deterministic_failed:${agent.intent}:${shortMessage(error)}`);
  }
}

export async function runCoach<K extends CoachIntent>(
  intent: K,
  ctx: CoachContext,
  opts: RunCoachOptions = {},
): Promise<CoachResult<CoachDataMap[K]>> {
  const agent = AGENTS[intent] as unknown as CoachAgent<K>;
  const generatedAt = ctx.now.toISOString();
  const allowLlm = opts.allowLlm ?? true;

  let result: CoachResult<CoachDataMap[K]>;

  if (allowLlm && llmAvailable()) {
    try {
      const prompt = agent.buildPrompt(ctx);
      const raw = await llmJSON<unknown>(prompt);
      result = {
        intent,
        data: agent.validate(raw, ctx),
        source: "llm",
        model: coachModel(),
        generatedAt,
      };
    } catch (error) {
      result = {
        intent,
        data: deterministic(agent, ctx),
        source: "deterministic",
        generatedAt,
        degraded: shortMessage(error),
      };
    }
  } else {
    result = {
      intent,
      data: deterministic(agent, ctx),
      source: "deterministic",
      generatedAt,
      degraded: allowLlm ? undefined : "llm_disabled",
    };
  }

  // Usage ledger: analytics + Free-plan enforcement. Best-effort by design.
  if ((opts.recordUsage ?? true) && ctx.userId && agent.feature && dbAvailable()) {
    try {
      const feature: Feature = agent.feature;
      const record = await enforceAndRecord(ctx.userId, ctx.businessId, feature, {
        intent,
        source: result.source,
        model: result.model ?? null,
      });
      if (!record.ok) result = { ...result, limited: true };
    } catch {
      // Never let bookkeeping break coaching.
    }
  }

  return result;
}

/** Convenience: a deterministic-only run (no key, no network, no ledger). */
export async function runCoachOffline<K extends CoachIntent>(
  intent: K,
  ctx: CoachContext,
): Promise<CoachResult<CoachDataMap[K]>> {
  return runCoach(intent, ctx, { allowLlm: false, recordUsage: false });
}
