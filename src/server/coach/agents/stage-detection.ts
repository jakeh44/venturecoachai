/**
 * stage-detection.ts — milestone checklist → the user's current stage.
 *
 * Stages are sequential, so the current stage is the FIRST stage whose
 * milestone is not yet evidenced. Nothing is inferred from vibes: each
 * milestone has an explicit, testable condition over the founder's facts, and
 * the output shows the full checklist so the founder can see exactly which
 * rung they are standing on and why.
 */

import { STAGES, isStageSlug, stageBySlug, type StageSlug } from "../stages";
import type { CoachAgent, CoachContext, StageDetectionData, StageMilestone } from "../types";
import {
  COACH_PERSONA,
  JSON_INSTRUCTION,
  asRecord,
  clamp,
  contextDigest,
  optNumber,
  optString,
  reqString,
  round,
} from "./util";

interface Milestone {
  slug: StageSlug;
  /** True when the milestone's evidence is present. */
  achieved(ctx: CoachContext): boolean;
  /** Human evidence line for the checklist. */
  evidence(ctx: CoachContext): string;
}

const CHECKLISTS: Milestone[] = [
  {
    slug: "find",
    achieved: (ctx) => ctx.facts.hasIdea && ctx.facts.hasTargetCustomer,
    evidence: (ctx) => {
      if (!ctx.facts.hasIdea) return "No problem/customer statement on file yet";
      if (!ctx.facts.hasTargetCustomer) return "Idea exists, but the buyer is still 'everyone'";
      return `Serving: ${ctx.intake.target_customer ?? "a defined segment"} — problem described`;
    },
  },
  {
    slug: "validate",
    achieved: (ctx) => ctx.facts.hasPayingCustomers || ctx.facts.validationEvidence >= 2,
    evidence: (ctx) =>
      ctx.facts.hasPayingCustomers
        ? `Someone is paying ($${(ctx.facts.monthlyRevenue ?? 0).toLocaleString("en-US")}/month)`
        : `${ctx.facts.validationEvidence} of 2 required paid/committed validation signals`,
  },
  {
    slug: "offer",
    achieved: (ctx) => ctx.facts.hasOffer,
    evidence: (ctx) =>
      ctx.facts.hasOffer
        ? "Offer has an outcome and a price the customer can repeat back"
        : "No price + outcome promise detected yet",
  },
  {
    slug: "sell",
    achieved: (ctx) =>
      ctx.facts.hasPayingCustomers &&
      ((ctx.facts.customers ?? 0) >= 3 || (ctx.facts.monthlyRevenue ?? 0) >= 1500),
    evidence: (ctx) =>
      `${ctx.facts.customers ?? 0} of 3 paying customers ($${(ctx.facts.monthlyRevenue ?? 0).toLocaleString("en-US")}/month)`,
  },
  {
    slug: "deliver",
    achieved: (ctx) =>
      ctx.facts.documentedProcesses >= 1 ||
      ((ctx.facts.customers ?? 0) >= 5 && ctx.facts.churnRate !== null && ctx.facts.churnRate <= 0.05),
    evidence: (ctx) =>
      ctx.facts.documentedProcesses >= 1
        ? `${ctx.facts.documentedProcesses} delivery checklist(s) in use`
        : "Delivery still runs from memory, not a checklist",
  },
  {
    slug: "systemize",
    achieved: (ctx) => ctx.facts.documentedProcesses >= 3,
    evidence: (ctx) => `${ctx.facts.documentedProcesses} of 3 core processes documented`,
  },
  {
    slug: "scale",
    achieved: (ctx) =>
      (ctx.facts.leadsPerMonth ?? 0) >= 20 &&
      ctx.facts.conversionRate !== null &&
      (ctx.facts.customers ?? 0) >= 25,
    evidence: (ctx) =>
      `Pipeline: ${ctx.facts.leadsPerMonth ?? 0} leads/month, ${
        ctx.facts.conversionRate === null ? "conversion not tracked" : `${round(ctx.facts.conversionRate * 100, 1)}% conversion`
      }, ${ctx.facts.customers ?? 0} of 25 customers`,
  },
  {
    slug: "optimize",
    achieved: (ctx) =>
      ctx.facts.pricePoint !== null && ctx.facts.churnRate !== null && ctx.facts.churnRate <= 0.03,
    evidence: (ctx) =>
      ctx.facts.churnRate === null
        ? "Unit economics and churn not measured yet"
        : `Churn ${round(ctx.facts.churnRate * 100, 1)}% (target ≤ 3%) with pricing on file`,
  },
  {
    slug: "delegate",
    achieved: (ctx) => ctx.facts.teamSize >= 1 && ctx.facts.documentedProcesses >= 5,
    evidence: (ctx) =>
      `Team of ${ctx.facts.teamSize}, ${ctx.facts.documentedProcesses} of 5 processes documented`,
  },
  {
    slug: "exit-or-compound",
    achieved: (ctx) => ctx.coaching?.healthSnapshot?.ownerDecision === true,
    evidence: (ctx) =>
      ctx.coaching?.healthSnapshot?.ownerDecision === true
        ? "Sell / hold / compound decision recorded"
        : "No owner-level decision on the asset yet",
  },
];

function buildMilestones(ctx: CoachContext): StageMilestone[] {
  return CHECKLISTS.map((check) => {
    const stage = stageBySlug(check.slug);
    let achieved = false;
    try {
      achieved = check.achieved(ctx);
    } catch {
      achieved = false;
    }
    return { slug: stage.slug, label: stage.label, achieved, evidence: check.evidence(ctx) };
  });
}

export function deterministicStageDetection(ctx: CoachContext): StageDetectionData {
  const milestones = buildMilestones(ctx);
  const firstOpen = milestones.find((milestone) => !milestone.achieved);
  const stage = stageBySlug(firstOpen?.slug ?? "exit-or-compound");
  const index = STAGES.findIndex((s) => s.slug === stage.slug);
  const achievedCount = milestones.filter((milestone) => milestone.achieved).length;
  const previous = ctx.coaching?.currentStage ?? ctx.facts.stage;
  const drifted = Boolean(previous && previous !== stage.slug);

  const knownSignals = [
    ctx.facts.hasIdea,
    ctx.facts.hasTargetCustomer,
    ctx.facts.customers !== null,
    ctx.facts.leadsPerMonth !== null,
    ctx.facts.conversionRate !== null,
    ctx.facts.churnRate !== null,
    ctx.facts.monthlyRevenue !== null,
  ].filter(Boolean).length;

  const nextStage = STAGES[index + 1]?.slug ?? null;

  const why = firstOpen
    ? `Milestones for the first ${achievedCount} stage(s) are evidenced; ${stage.label} is the first one still open — ${firstOpen.evidence}.${
        drifted && previous ? ` (Previous record said ${stageBySlug(previous).label}; the evidence now points here.)` : ""
      }`
    : "All ten milestones are evidenced — the remaining work is owner-level, not operational.";

  return {
    stage: stage.slug,
    label: stage.label,
    focus: stage.focus,
    index: Math.max(index, 0),
    total: STAGES.length,
    progress: round(achievedCount / STAGES.length, 2),
    confidence: clamp(0.5 + knownSignals * 0.06, 0.5, 0.92),
    why,
    milestones,
    nextStage,
    nextMilestone: stage.milestone,
  };
}

const SYSTEM = `${COACH_PERSONA}\n\nYou are running milestone-based stage detection over a fixed sequential roadmap. ${JSON_INSTRUCTION}`;

export const stageDetectionAgent: CoachAgent<"stage_detection"> = {
  intent: "stage_detection",
  label: "Stage detection",
  feature: null,
  deterministic: deterministicStageDetection,
  buildPrompt(ctx) {
    const baseline = deterministicStageDetection(ctx);
    return {
      system: SYSTEM,
      user: [
        contextDigest(ctx),
        "",
        `Roadmap (sequential): ${STAGES.map((s, i) => `${i + 1}.${s.slug} — ${s.milestone}`).join("\n")}`,
        "",
        "Milestone evidence observed:",
        baseline.milestones.map((m) => `- ${m.slug}: ${m.achieved ? "ACHIEVED" : "OPEN"} — ${m.evidence}`).join("\n"),
        "",
        `The rule engine concluded stage "${baseline.stage}". Confirm or correct it, but never advance past an open milestone. Return JSON: {"stage":"<one of the ten slugs>","why":"2-3 sentences citing the evidence","confidence":0.0-1.0}`,
      ].join("\n"),
    };
  },
  validate(raw, ctx) {
    const record = asRecord(raw);
    const base = deterministicStageDetection(ctx);
    const stage = reqString(record, "stage");
    if (!isStageSlug(stage)) throw new Error("llm_bad_stage");
    const index = STAGES.findIndex((s) => s.slug === stage);
    // A model must never jump past an open milestone: clamp to the
    // deterministic stage when it tries to move ahead of the evidence.
    const baseIndex = STAGES.findIndex((s) => s.slug === base.stage);
    const chosen = stageBySlug(index > baseIndex ? base.stage : stage);
    return {
      ...base,
      stage: chosen.slug,
      label: chosen.label,
      focus: chosen.focus,
      index: STAGES.findIndex((s) => s.slug === chosen.slug),
      why: optString(record, "why", base.why),
      confidence: optNumber(record, "confidence", base.confidence, 0.3, 0.99),
      nextStage: STAGES[STAGES.findIndex((s) => s.slug === chosen.slug) + 1]?.slug ?? null,
      nextMilestone: chosen.milestone,
    };
  },
};
