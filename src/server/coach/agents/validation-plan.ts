/**
 * validation-plan.ts — the cheapest set of tests that would kill (or confirm)
 * the assumptions the business currently rests on.
 *
 * Used two ways:
 *  1. as its own coach intent ("validation_plan")
 *  2. inside idea-analysis, which hands it the assumptions it scored weakest
 *
 * Everything here is a real, run-this-week test: no "do more research".
 */

import type { CoachAgent, CoachContext, ValidationPlanData, ValidationStep } from "../types";
import { COACH_PERSONA, JSON_INSTRUCTION, asRecord, contextDigest, optString, reqString } from "./util";

export type AssumptionKey =
  | "problem"
  | "willingness_to_pay"
  | "reachable_customers"
  | "delivery"
  | "repeat"
  | "founder_capacity"
  | "substitutes";

export interface Assumption {
  key: AssumptionKey;
  assumption: string;
  risk: "high" | "medium" | "low";
  why: string;
}

interface TestTemplate extends Omit<ValidationStep, "assumption"> {
  targets: AssumptionKey[];
}

const TESTS: TestTemplate[] = [
  {
    targets: ["problem"],
    title: "10 problem interviews, no pitching",
    method:
      "Interview 10 people in your target segment. Ask only about the last time the problem occurred, what it cost them in money or hours, and what they did about it. Never describe your idea.",
    cost: "$0",
    timeframe: "7 days",
    successSignal: "6+ people describe the problem unprompted as expensive or urgent",
  },
  {
    targets: ["problem"],
    title: "Shop the competition (buy their solution)",
    method:
      "Buy or trial the closest existing solution and use it for a week. Document where it breaks for your segment.",
    cost: "$20–200",
    timeframe: "5 days",
    successSignal: "You can name a specific gap you can serve better, with evidence of what the incumbent charges",
  },
  {
    targets: ["willingness_to_pay"],
    title: "Deposit test at full price",
    method:
      "Ask 10 qualified prospects to pay a 25% deposit for the outcome you described, at the price you intend to charge. No discounts, no free trials.",
    cost: "$0",
    timeframe: "10 days",
    successSignal: "2+ deposits collected (a deposit is the only honest yes)",
  },
  {
    targets: ["willingness_to_pay"],
    title: "Price ladder",
    method:
      "Quote the same offer at three price points to similar prospects (low / target / high) and record the response. Find where interest breaks.",
    cost: "$0",
    timeframe: "7 days",
    successSignal: "A price band with real interest that still clears your income goal",
  },
  {
    targets: ["reachable_customers"],
    title: "20-conversation outreach sprint",
    method:
      "Write one short, honest message for one channel (existing network, LinkedIn, local group, referrals). Send it to 20 specific people and track replies per 20 sends.",
    cost: "$0",
    timeframe: "7 days",
    successSignal: "≥3 replies and ≥1 conversation that reaches the problem you solve",
  },
  {
    targets: ["reachable_customers"],
    title: "One-page offer test",
    method:
      "Publish a single page stating the outcome, price and a booking link. Drive 100 targeted visits from one channel and measure bookings.",
    cost: "$0–100",
    timeframe: "10 days",
    successSignal: "≥2% of targeted visitors book a conversation",
  },
  {
    targets: ["delivery"],
    title: "Concierge delivery for one paying customer",
    method:
      "Deliver the promised outcome manually for one paying customer, timing every step. Write the checklist while you do it.",
    cost: "$0 (time)",
    timeframe: "14 days",
    successSignal: "Customer confirms the outcome was delivered, and you have a repeatable step list",
  },
  {
    targets: ["repeat"],
    title: "Repeat-purchase check",
    method:
      "Ask your customers whether the problem returns (monthly, quarterly, one-off) and whether they would prepay for another cycle.",
    cost: "$0",
    timeframe: "7 days",
    successSignal: "3+ customers expect the problem to recur and 1 prepays",
  },
  {
    targets: ["founder_capacity"],
    title: "One-week time audit",
    method:
      "Log every hour for one week against delivery, sales, admin and building. Then compare delivery hours per customer with the hours you actually have.",
    cost: "$0",
    timeframe: "7 days",
    successSignal: "Delivery fits your available hours at the customer count you are targeting",
  },
  {
    targets: ["substitutes"],
    title: "Substitute-switch interview",
    method:
      "Ask 5 prospects what they do today instead of buying (hire, DIY, spreadsheet, ignore) and what switching would cost them.",
    cost: "$0",
    timeframe: "7 days",
    successSignal: "You can state the switching cost and why it is worth paying",
  },
];

/** The standing assumption set, with risk judged from the founder's own facts. */
export function deriveAssumptions(ctx: CoachContext): Assumption[] {
  const f = ctx.facts;
  const segment = ctx.intake.target_customer?.trim() || "your target segment";
  const assumptions: Assumption[] = [
    {
      key: "problem",
      assumption: `${segment} experience this problem as expensive or urgent enough to act on`,
      risk: f.validationEvidence >= 2 ? "low" : f.validationEvidence === 1 ? "medium" : "high",
      why:
        f.validationEvidence >= 2
          ? "You already have paid or committed signals pointing the same way."
          : "Interest has not yet been converted into a commitment, so severity is still your opinion.",
    },
    {
      key: "willingness_to_pay",
      assumption: `${segment} will pay your intended price repeatedly`,
      risk: f.hasPayingCustomers ? "low" : "high",
      why: f.hasPayingCustomers
        ? `Revenue of $${(f.monthlyRevenue ?? 0).toLocaleString("en-US")}/month proves payment, but not yet at target price.`
        : "Nobody has paid yet — price acceptance is completely untested.",
    },
    {
      key: "reachable_customers",
      assumption: "You can reach this segment repeatedly at a cost that leaves margin",
      risk: f.leadsPerMonth === null || f.leadsPerMonth < 5 ? "high" : "medium",
      why:
        f.leadsPerMonth === null
          ? "No lead or conversation volume is tracked, so there is no channel to project from."
          : `${f.leadsPerMonth} conversations a month is below the volume a repeatable channel needs.`,
    },
    {
      key: "delivery",
      assumption: "You can deliver the promised outcome repeatably, at the price charged",
      risk: f.documentedProcesses > 0 ? "low" : "medium",
      why:
        f.documentedProcesses > 0
          ? "At least one delivery checklist exists and has been used."
          : "Delivery has never been written down, so quality and time are unproven at volume.",
    },
    {
      key: "repeat",
      assumption: "The problem recurs often enough to produce repeat revenue",
      risk: f.churnRate === null ? "medium" : f.churnRate > 0.05 ? "high" : "low",
      why:
        f.churnRate === null
          ? "Retention is not measured, so recurring value is unproven."
          : `Measured churn of ${Math.round(f.churnRate * 1000) / 10}%/month tells you whether value recurs.`,
    },
    {
      key: "founder_capacity",
      assumption: "You have the skills and hours to serve the customers you are targeting",
      risk: (f.hoursPerWeek ?? 0) >= 20 ? "low" : "medium",
      why:
        f.hoursPerWeek === null
          ? "Hours available per week are unknown."
          : `${f.hoursPerWeek} hours/week is the hard ceiling on every plan.`,
    },
    {
      key: "substitutes",
      assumption: "Your offer beats what the customer already does instead of buying",
      risk: f.hasOffer ? "medium" : "high",
      why: f.hasOffer
        ? "You have a price and outcome, but the switching argument is not documented."
        : "Without a defined offer there is nothing to compare against the status quo.",
    },
  ];
  return assumptions;
}

const RISK_ORDER: Record<Assumption["risk"], number> = { high: 0, medium: 1, low: 2 };

/**
 * Build the plan: target the riskiest assumptions first, one test each,
 * capped so the whole plan fits a founder's real week.
 */
export function buildValidationPlan(
  ctx: CoachContext,
  assumptions: Assumption[] = deriveAssumptions(ctx),
  maxSteps = 4,
): ValidationPlanData {
  const ordered = [...assumptions].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
  const steps: ValidationStep[] = [];
  for (const assumption of ordered) {
    if (steps.length >= maxSteps) break;
    const test = TESTS.find(
      (candidate) =>
        candidate.targets.includes(assumption.key) &&
        !steps.some((step) => step.title === candidate.title),
    );
    if (!test) continue;
    steps.push({
      title: test.title,
      assumption: assumption.assumption,
      method: test.method,
      cost: test.cost,
      timeframe: test.timeframe,
      successSignal: test.successSignal,
    });
  }

  const moneyCost = steps.reduce((sum, step) => {
    const numbers = step.cost.match(/\d+/g)?.map(Number) ?? [];
    return sum + (numbers.length ? Math.max(...numbers) : 0);
  }, 0);
  const slowest = steps.reduce((slowestDays, step) => {
    const days = Number(step.timeframe.match(/(\d+)/)?.[1] ?? 0);
    return Math.max(slowestDays, days);
  }, 0);

  const topRisk = ordered[0];
  return {
    assumptions: ordered,
    steps,
    totalCost: moneyCost === 0 ? "$0–100 (mostly your time)" : `up to $${moneyCost.toLocaleString("en-US")}`,
    totalTime: slowest === 0 ? "no tests generated" : `~${slowest} days, run in parallel where possible`,
    killCriteria: `Stop and re-aim if, after ${steps.length * 10} qualified conversations, you have zero deposits, zero repeat requests, and nobody says they already pay to solve this.`,
    summary: topRisk
      ? `Your riskiest assumption is at the top of the list. Run these ${steps.length} tests before building anything else — each one is designed to produce a yes/no, not a feeling.`
      : "No assumptions could be derived — complete onboarding so the coach has something to test.",
  };
}

const SYSTEM = `${COACH_PERSONA}\n\nYou design cheap falsification tests (validation plans) for pre-revenue and early-revenue businesses. ${JSON_INSTRUCTION}`;

const SCHEMA = `{
  "assumptions": [{"assumption":"...","risk":"high|medium|low","why":"..."}],
  "steps": [{"title":"...","assumption":"...","method":"2-4 sentences, concrete and doable this week","cost":"$0","timeframe":"7 days","successSignal":"numeric pass/fail"}],
  "totalCost": "...",
  "totalTime": "...",
  "killCriteria": "the observable result that means stop and re-aim",
  "summary": "2-3 sentences"
}`;

export const validationPlanAgent: CoachAgent<"validation_plan"> = {
  intent: "validation_plan",
  label: "Validation plan",
  feature: null,
  deterministic: (ctx) => buildValidationPlan(ctx),
  buildPrompt(ctx) {
    const base = buildValidationPlan(ctx);
    return {
      system: SYSTEM,
      user: [
        contextDigest(ctx),
        "",
        "Deterministic baseline assumptions (risk-ranked):",
        JSON.stringify(base.assumptions),
        "",
        "Produce a plan of at most 4 tests targeting the riskiest assumptions. Each test needs a numeric success signal and must be finishable within 14 days on a near-zero budget.",
        "Return JSON exactly matching this shape:",
        SCHEMA,
      ].join("\n"),
    };
  },
  validate(raw, ctx) {
    const record = asRecord(raw);
    const base = buildValidationPlan(ctx);
    const steps = Array.isArray(record.steps) ? record.steps : [];
    const coerced: ValidationStep[] = steps.slice(0, 5).map((step, index) => {
      const item = asRecord(step);
      const fallback = base.steps[index] ?? base.steps[0];
      if (!fallback) throw new Error("llm_no_validation_steps");
      return {
        title: reqString(item, "title"),
        assumption: optString(item, "assumption", fallback.assumption),
        method: reqString(item, "method"),
        cost: optString(item, "cost", fallback.cost),
        timeframe: optString(item, "timeframe", fallback.timeframe),
        successSignal: reqString(item, "successSignal"),
      };
    });
    if (coerced.length === 0) throw new Error("llm_empty_validation_plan");
    const assumptions = Array.isArray(record.assumptions)
      ? record.assumptions
          .slice(0, 8)
          .map((item) => {
            const row = asRecord(item);
            const riskRaw = optString(row, "risk", "medium");
            const risk: Assumption["risk"] =
              riskRaw === "high" || riskRaw === "low" ? riskRaw : "medium";
            return {
              assumption: reqString(row, "assumption"),
              risk,
              why: optString(row, "why", "Assessed from the founder's stated facts."),
            };
          })
      : base.assumptions;
    return {
      ...base,
      assumptions,
      steps: coerced,
      summary: optString(record, "summary", base.summary),
      killCriteria: optString(record, "killCriteria", base.killCriteria),
      totalCost: optString(record, "totalCost", base.totalCost),
      totalTime: optString(record, "totalTime", base.totalTime),
    };
  },
};
