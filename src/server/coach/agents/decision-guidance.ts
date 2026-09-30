/**
 * decision-guidance.ts — the 14-step Decision Engine.
 *
 * A fixed walkthrough (the product's "think like an operator" spine) plus a
 * weighted scoring model over explicit criteria and a recommendation with the
 * WHY stated: which criteria decided it, what risk is being accepted, the
 * first 30-minute step, and the tripwire that would reverse the call.
 *
 * Scores are heuristic and explainable — every number comes from the words in
 * the option and the founder's own stage/constraint.
 */

import { resolveStageInfo } from "./stage-resolver";
import type {
  CoachAgent,
  CoachContext,
  DecisionGuidanceData,
  DecisionOptionScore,
  DecisionStep,
} from "../types";
import { deterministicBottleneck } from "./bottleneck";
import {
  COACH_PERSONA,
  JSON_INSTRUCTION,
  asRecord,
  clamp,
  contextDigest,
  optString,
  reqString,
  round,
  stringArray,
} from "./util";

const STEPS: { name: string; question: string; guidance: string }[] = [
  {
    name: "Name the decision",
    question: "What exactly am I deciding — in one sentence?",
    guidance: "If it takes three sentences, it is three decisions. Write the single one you are actually stuck on.",
  },
  {
    name: "Set the decide-by date",
    question: "When must this be decided, and what happens if I don't?",
    guidance: "Undated decisions drift for months and cost more than a wrong call made quickly.",
  },
  {
    name: "Define 'good'",
    question: "What outcome makes this a success in 90 days?",
    guidance: "Make it measurable: a number, a date, and a condition you could observe from outside.",
  },
  {
    name: "List the real options",
    question: "What are the plausible options, including 'do nothing'?",
    guidance: "Always include the status quo — it is the option you are already paying for.",
  },
  {
    name: "Choose and weight the criteria",
    question: "What matters here, and how much?",
    guidance: "Weights force honesty: you cannot value speed and perfection equally.",
  },
  {
    name: "Score each option",
    question: "How does each option perform on each criterion, 1–10?",
    guidance: "Score from evidence you already have, not from optimism about the future.",
  },
  {
    name: "Compute the weighted result",
    question: "Which option wins on the weighted total?",
    guidance: "Treat the number as a mirror, not an oracle — a surprise here means a hidden criterion.",
  },
  {
    name: "Test the constraints",
    question: "Does the winner fit my money, hours, skills and stage?",
    guidance: "It only counts if it fits your real week and your current stage's milestone.",
  },
  {
    name: "Check reversibility",
    question: "Is this a one-way door or a two-way door?",
    guidance: "Two-way doors should be decided fast. One-way doors deserve the full walkthrough.",
  },
  {
    name: "Stress the downside",
    question: "What is the worst realistic case, and can I survive it?",
    guidance: "Write the mitigation next to the risk. Un-mitigated downside is not a plan.",
  },
  {
    name: "Find the cheap test",
    question: "What small test would make this decision obvious?",
    guidance: "If a $0–200, two-week test exists, run it before deciding at all.",
  },
  {
    name: "Check alignment",
    question: "Does this serve my constraint and my 12-month goal?",
    guidance: "Anything that does not move your binding constraint is a distraction dressed as progress.",
  },
  {
    name: "Sleep on it, then decide",
    question: "Overnight: does the answer still feel right?",
    guidance: "Then decide out loud, to a person, and write the date you decided.",
  },
  {
    name: "Commit, and set the tripwire",
    question: "What is the first action, and what would reverse this?",
    guidance: "Name the 30-minute first step, the owner, and the number that means 'undo this'.",
  },
];

const DEFAULT_CRITERIA: { name: string; weight: number; why: string }[] = [
  {
    name: "Impact on the constraint",
    weight: 0.2,
    why: "Only work that moves the binding constraint compounds.",
  },
  { name: "Time to result", weight: 0.15, why: "Early feedback beats a bigger payoff that arrives late." },
  { name: "Cost and resources", weight: 0.12, why: "Cash and hours are finite; keep the downside survivable." },
  { name: "Risk and downside", weight: 0.15, why: "Modelled risk is manageable; unmodelled risk is not." },
  { name: "Reversibility", weight: 0.12, why: "Cheap-to-undo options can be decided quickly and tested live." },
  {
    name: "Stage and milestone fit",
    weight: 0.16,
    why: "The right move at the wrong stage sets the business back.",
  },
  { name: "Founder energy and alignment", weight: 0.1, why: "Work you will actually finish beats optimal work you won't." },
];

interface OptionSignals {
  label: string;
  scores: Record<string, number>;
  pros: string[];
  cons: string[];
}

const POSITIVE = /test|trial|pilot|experiment|small|cheap|free|myself|first|start|ask|call|sell|launch|quick|today|this week|referral|outreach|price/i;
const IRREVERSIBLE = /quit|resign|sell the business|shut down|sign (a )?(contract|lease)|lease|borrow|loan|mortgage|hire (a )?(full|permanent|someone)|full-?time hire|liquidat|dissolve|all in|burn the/i;
const SLOW = /build|rebuild|learn|course|degree|migrate|redesign|year|next year|eventually|someday|later|wait/i;
const EXPENSIVE = /hire|agency|ads|advertis|equipment|inventory|invest|loan|buy (a )?(machine|vehicle|building)|outsourc/i;
const BUSYWORK = /logo|brand(ing)?|website|redesign|social media|business plan|deck|research|course|networking/i;

function scoreOption(label: string, ctx: CoachContext): OptionSignals {
  const text = label.toLowerCase();
  const stage = resolveStageInfo(ctx);
  const constraint = deterministicBottleneck(ctx);
  const constraintWords = `${constraint.slug} ${constraint.constraint} ${constraint.nextAction}`.toLowerCase();

  const pros: string[] = [];
  const cons: string[] = [];

  const impact = clamp(5 + (text.match(/sell|customer|revenue|price|outreach|launch|ask|call|pilot/i) ? 3 : 0) - (BUSYWORK.test(text) ? 2.5 : 0), 1, 10);
  if (impact >= 7) pros.push("directly moves revenue or customer proof");
  if (impact <= 4) cons.push("no direct path to revenue or proof");

  const speed = clamp(5 + (POSITIVE.test(text) ? 2.5 : 0) - (SLOW.test(text) ? 3 : 0), 1, 10);
  if (speed >= 7) pros.push("produces an answer quickly");
  if (speed <= 4) cons.push("slower feedback than the alternatives");

  const cost = clamp(6 + (POSITIVE.test(text) ? 1.5 : 0) - (EXPENSIVE.test(text) ? 3.5 : 0), 1, 10);
  if (cost <= 4) cons.push("requires money or commitments you do not have");

  const risk = clamp(5 + (POSITIVE.test(text) ? 2 : 0) - (IRREVERSIBLE.test(text) ? 4 : 0), 1, 10);
  if (risk <= 4) cons.push("downside is hard to contain");
  if (risk >= 7) pros.push("failure would be contained and survivable");

  const reversibility = clamp(6 + (POSITIVE.test(text) ? 1.5 : 0) - (IRREVERSIBLE.test(text) ? 4.5 : 0), 1, 10);
  if (reversibility <= 4) cons.push("effectively one-way — hard to undo");

  const stageFit = clamp(
    5 + (constraintWords.includes(text.split(" ")[0] ?? "") ? 1 : 0) + (stage.slug === "sell" && /sell|customer|outreach|price/i.test(text) ? 2 : 0) - (BUSYWORK.test(text) ? 3 : 0),
    1,
    10,
  );
  if (stageFit <= 4) cons.push(`does not advance the ${stage.label} milestone`);

  const energy = clamp(5 + (POSITIVE.test(text) ? 1.5 : 0) - (/should|supposed to|duty|but i|everyone else/i.test(text) ? 2 : 0), 1, 10);

  return {
    label,
    scores: {
      "Impact on the constraint": Math.round(impact),
      "Time to result": Math.round(speed),
      "Cost and resources": Math.round(cost),
      "Risk and downside": Math.round(risk),
      Reversibility: Math.round(reversibility),
      "Stage and milestone fit": Math.round(stageFit),
      "Founder energy and alignment": Math.round(energy),
    },
    pros,
    cons,
  };
}

/**
 * Pull options out of the founder's input — but only when the input is
 * genuinely a list. A bare prompt ("Should I raise my price?") is the question,
 * not an option, so it must not be mistaken for one: we require an explicit
 * separator (newline or "|") or list markers before anything is treated as an
 * option set.
 */
export function parseOptions(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const hasSeparator = /[\n|]/.test(raw);
  const hasMarkers = /(^|\s)(?:[-*•]|[a-z]\)|\d+[.)])\s/i.test(raw);
  if (!hasSeparator && !hasMarkers) return [];
  const lines = raw
    .split(/[\n|]/)
    .map((line) => line.replace(/^\s*(?:[-*•]|[a-z]\)|\d+[.)])\s*/i, "").trim())
    .filter((line) => line.length > 2 && line.length < 140);
  return lines.length > 1 ? lines.slice(0, 6) : [];
}

const DEFAULT_OPTIONS = ["Do it now", "Do it in 30 days", "Do not do it"];

export function deterministicDecisionGuidance(ctx: CoachContext): DecisionGuidanceData {
  const prompt = (ctx.input ?? "").trim();
  const explicit = (ctx.options ?? []).map((option) => option.trim()).filter(Boolean);
  const parsed = explicit.length > 0 ? explicit : parseOptions(prompt);
  const usedDefaults = parsed.length === 0;
  const labels = (usedDefaults ? DEFAULT_OPTIONS : parsed).slice(0, 5);

  const criteria = DEFAULT_CRITERIA.map((criterion) => ({ ...criterion }));
  const signals = labels.map((label) => scoreOption(label, ctx));

  const options: DecisionOptionScore[] = signals.map((signal) => {
    const weightedTotal = round(
      criteria.reduce((sum, criterion) => sum + (signal.scores[criterion.name] ?? 5) * criterion.weight, 0),
      2,
    );
    return {
      label: signal.label,
      score: Math.round(weightedTotal * 10),
      weightedTotal,
      pros: signal.pros.slice(0, 3),
      cons: signal.cons.slice(0, 3),
      scores: Object.entries(signal.scores).map(([criterion, score]) => ({ criterion, score })),
    };
  });

  const ranked = [...options].sort((a, b) => b.weightedTotal - a.weightedTotal);
  const best = ranked[0];
  const second = ranked[1];
  const gap = best && second ? round(best.weightedTotal - second.weightedTotal, 2) : 10;
  const confidence = clamp(0.45 + gap * 0.12, 0.4, 0.9);

  const decidingCriteria = best
    ? [...best.scores]
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((entry) => entry.criterion)
    : [];

  const doorText = `${prompt} ${labels.join(" ")}`;
  const doorType: DecisionGuidanceData["doorType"] = IRREVERSIBLE.test(doorText) ? "one_way_door" : "two_way_door";

  const whyNot = ranked.slice(1).map((option) => {
    const weakest = [...option.scores].sort((a, b) => a.score - b.score)[0];
    return {
      option: option.label,
      reason: weakest
        ? `Weakest on ${weakest.criterion} (${weakest.score}/10) — ${criteria.find((c) => c.name === weakest.criterion)?.why ?? ""}`.trim()
        : "Scored lower across the weighted criteria.",
    };
  });

  const recommendation: DecisionGuidanceData["recommendation"] = best
    ? {
        choice: best.label,
        confidence: round(confidence, 2),
        why: `Wins on ${decidingCriteria.join(" and ")}, scoring ${best.weightedTotal.toFixed(1)}/10 weighted vs ${(
          second?.weightedTotal ?? 0
        ).toFixed(1)} for the next best. ${
          gap < 0.3 ? "The margin is thin — the cheap test in step 11 is the tie-breaker." : "The margin is clear enough to act."
        }`,
        risks: best.cons.length > 0 ? best.cons : ["Main risk: the assumed time to result slips past the decide-by date."],
        firstStep: `Spend 30 minutes on the first concrete step of "${best.label}" today, and tell one person you are doing it.`,
        reversesIf: doorType === "one_way_door"
          ? "Reverses if the downside you modelled starts appearing in week one — set a checkpoint date before you start."
          : "Reverses if the metric you named has not moved after two weeks of real effort.",
      }
    : null;

  const summary = usedDefaults
    ? `No options were supplied, so this runs the default frame: act now vs. defer 30 days vs. decline. ${
        prompt ? `Decision under review: "${prompt.slice(0, 200)}".` : ""
      } Add your own options to get a scored comparison.`
    : `Compared ${labels.length} options on ${criteria.length} weighted criteria. ${
        best ? `Recommendation: ${best.label} (${best.score}/100).` : "No option scored clearly."
      } ${doorType === "one_way_door" ? "This looks like a one-way door — do the full walkthrough before acting." : "This is a two-way door — decide fast, test live, and keep it reversible."}`;

  const steps: DecisionStep[] = STEPS.map((step, index) => ({ n: index + 1, ...step }));

  return { prompt, doorType, steps, criteria, options, recommendation, whyNot, summary };
}

const SYSTEM = `${COACH_PERSONA}\n\nYou run a 14-step decision framework with weighted criteria. You always state the WHY behind a recommendation and the condition that would reverse it. ${JSON_INSTRUCTION}`;

export const decisionGuidanceAgent: CoachAgent<"decision_guidance"> = {
  intent: "decision_guidance",
  label: "Decision Engine",
  feature: "decision_guidance",
  deterministic: deterministicDecisionGuidance,
  buildPrompt(ctx) {
    const base = deterministicDecisionGuidance(ctx);
    return {
      system: SYSTEM,
      user: [
        contextDigest(ctx),
        "",
        `DECISION: ${base.prompt || "not stated — ask the founder to name it"}`,
        `OPTIONS: ${base.options.map((option) => option.label).join(" | ")}`,
        `DOORMAT: ${base.doorType}`,
        "",
        "Deterministic weighted scoring (criteria weights fixed; scores are heuristics to review):",
        JSON.stringify(
          base.options.map((option) => ({ label: option.label, weighted_total: option.weightedTotal, cons: option.cons })),
        ),
        "",
        "Return JSON: {\"recommendation\":{\"choice\":\"must be one of the options\",\"confidence\":0.0-1.0,\"why\":\"names the criteria that decided it\",\"risks\":[\"...\"],\"firstStep\":\"30-minute action\",\"reversesIf\":\"tripwire\"},\"summary\":\"2-3 sentences\",\"criterionNotes\":[\"optional insight\"]}",
      ].join("\n"),
    };
  },
  validate(raw, ctx) {
    const record = asRecord(raw);
    const base = deterministicDecisionGuidance(ctx);
    const notes = stringArray(record.criterionNotes ?? record.insights, 4);
    const recRaw = record.recommendation;
    if (!recRaw || typeof recRaw !== "object") {
      // A model may legitimately say "no options given" — accept that, but only
      // when our own deterministic run also had nothing to score.
      if (base.options.length === 0) return base;
      throw new Error("llm_missing_recommendation");
    }
    const rec = asRecord(recRaw);
    const choice = reqString(rec, "choice");
    const matched = base.options.find((option) => option.label.toLowerCase() === choice.toLowerCase()) ?? base.options[0];
    if (!matched) throw new Error("llm_unknown_option");
    return {
      ...base,
      recommendation: {
        choice: matched.label,
        confidence: clamp(Number(rec.confidence) || base.recommendation?.confidence || 0.6, 0.2, 0.99),
        why: optString(rec, "why", base.recommendation?.why ?? ""),
        risks: stringArray(rec.risks, 4).length > 0 ? stringArray(rec.risks, 4) : (base.recommendation?.risks ?? []),
        firstStep: optString(rec, "firstStep", base.recommendation?.firstStep ?? ""),
        reversesIf: optString(rec, "reversesIf", base.recommendation?.reversesIf ?? ""),
      },
      summary:
        optString(record, "summary", base.summary) + (notes.length > 0 ? ` Coach note: ${notes.join(" ")}` : ""),
    };
  },
};

/** Exposed for tests / the Decision Engine UI. */
export const DECISION_STEP_COUNT = STEPS.length;
