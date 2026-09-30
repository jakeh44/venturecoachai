/**
 * scripts/verify-tools.ts — offline contract check for the founder tool pages.
 *
 * No database, no LLM keys. It runs the same deterministic agents the pages call
 * and pushes the results through the same row normalizers the server functions
 * use, so a broken data contract for /idea-analyzer, /decision-engine or
 * /experiments fails here instead of on screen.
 *
 *   bun scripts/verify-tools.ts
 */

import { runCoachOffline } from "../src/server/coach/engine";
import { computeHealthScore } from "../src/server/coach/health";
import { deriveFacts } from "../src/server/coach/intake";
import { ideaIntakeOverlay } from "../src/server/coach/service";
import {
  buildCoachContext,
  emptyFacts,
  normalizeDecisionRow,
  normalizeExperimentRow,
  normalizeIdeaAnalysisRow,
} from "../src/server/coach/types";

let failures = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const intake: Record<string, string> = {
  name: "Sam Rivera",
  occupation: "Freelance designer",
  experience: "5 years of design work",
  current_business: "no",
  business_idea: "A subscription design service for independent coffee shops",
  target_customer: "Cafe owners with 1-3 locations",
  current_revenue: "0",
  income_goal: "8000",
  startup_capital: "2000",
  hours_per_week: "25",
  skills: "design, branding",
  network_resources: "30 cafe owners I know",
  biggest_obstacle: "not enough leads",
  risk_tolerance: "medium",
  business_model: "subscription",
  ambition: "replace my freelance income",
};

const facts = { ...emptyFacts(), ...deriveFacts(intake) };
const base = buildCoachContext({ userId: "verify", intake, facts });
const enhanced = { ...base, health: computeHealthScore(base) };

/* --- Idea Analyzer ------------------------------------------------- */

console.log("idea-analyzer:");
const form = {
  title: "Clinic compliance calendar",
  description:
    "A $99/month subscription that tracks clinic licence renewals, sends compliance reminders and files audit reports. Clinics lose money when a licence lapses.",
  targetCustomer: "Single-location dental clinics",
  alternative: "A spreadsheet the office manager keeps",
  priceRange: "$99/month",
};
const overlay = ideaIntakeOverlay(form);
const ideaCtx = { ...enhanced, intake: { ...intake, ...overlay }, input: form.title };
const ideaResult = await runCoachOffline("idea_analysis", ideaCtx);
const idea = ideaResult.data;

check("15 category scores", idea.categories.length === 15, `${idea.categories.length}`);
check(
  "every score is 1-10 with a reason",
  idea.categories.every((c) => c.score >= 1 && c.score <= 10 && c.reason.length > 0),
);
check("overall score 1-100", idea.overallScore >= 1 && idea.overallScore <= 100, `${idea.overallScore}/100 ${idea.grade}`);
check("known/assumed/unknown split", idea.knownAssumedUnknown.unknown.length > 0);
check("validation plan (cheapest first)", idea.validationPlan.length > 0, `${idea.validationPlan.length} steps`);
check(
  "validation steps carry method + cost + signal",
  idea.validationPlan.every((s) => s.method.length > 0 && s.cost.length > 0 && s.successSignal.length > 0),
);
check("form text reaches the scoring blob", overlay.business_idea?.includes("compliance") === true);

const ideaRecord = normalizeIdeaAnalysisRow({
  id: "11111111-1111-1111-1111-111111111111",
  scores: {
    overallScore: idea.overallScore,
    categories: idea.categories,
    title: form.title,
    grade: idea.grade,
    verdict: idea.verdict,
  },
  known_assumed_unknown: idea.knownAssumedUnknown,
  validation_plan: idea.validationPlan,
  summary: idea.summary,
  source: "deterministic",
  created_at: new Date().toISOString(),
});
check("history row normalizes", ideaRecord !== null);
check("history row keeps 15 scores", ideaRecord?.categories.length === 15);
check("history row keeps the title", ideaRecord?.title === form.title);
check("history row keeps the plan", (ideaRecord?.validationPlan.length ?? 0) > 0);

/* --- Decision Engine ----------------------------------------------- */

console.log("decision-engine:");
const decisionOptions = [
  { label: "Raise prices 20% next month", pros: "immediate cash", cons: "some churn" },
  { label: "Keep prices, add a premium tier", pros: "tests new willingness to pay", cons: "slower" },
  { label: "Do nothing for 90 days", pros: "no risk", cons: "margin stays thin" },
];
const decisionCtx = {
  ...enhanced,
  input: "Should I raise prices 20% next month?",
  options: decisionOptions.map((option) => option.label),
};
const decisionResult = await runCoachOffline("decision_guidance", decisionCtx);
const decision = decisionResult.data;

check("14 steps from the framework", decision.steps.length === 14, `${decision.steps.length}`);
check("every step has a question + guidance", decision.steps.every((s) => s.question.length > 0 && s.guidance.length > 0));
check("7 weighted criteria", decision.criteria.length === 7);
check("every option scored", decision.options.length === decisionOptions.length, `${decision.options.length}`);
check("recommendation has the WHY", typeof decision.recommendation?.why === "string" && decision.recommendation.why.length > 0);
check("recommendation has the smallest next step", (decision.recommendation?.firstStep.length ?? 0) > 0);
check("recommendation has a tripwire", (decision.recommendation?.reversesIf.length ?? 0) > 0);
check("reversibility is classified", decision.doorType === "one_way_door" || decision.doorType === "two_way_door", decision.doorType);
check("opportunity costs are stated", decision.whyNot.length === decisionOptions.length - 1, `${decision.whyNot.length}`);

const decisionRecord = normalizeDecisionRow({
  id: "22222222-2222-2222-2222-222222222222",
  prompt: "Should I raise prices 20% next month?",
  options: {
    scored: decision.options,
    input: decisionOptions.map((option) => ({ label: option.label, pros: option.pros ?? "", cons: option.cons ?? "" })),
  },
  criteria: decision.criteria,
  steps: { items: decision.steps, progress: 5, notes: { "step-1": "raise prices" } },
  recommendation: { ...(decision.recommendation ?? {}), doorType: decision.doorType, summary: decision.summary },
  status: "open",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
check("stored walkthrough normalizes", decisionRecord !== null);
check("resume point is kept", decisionRecord?.progress === 5);
check("per-step notes are kept", decisionRecord?.notes["step-1"] === "raise prices");
check("founder's own pros/cons survive", decisionRecord?.input.length === decisionOptions.length);
check("legacy array-shaped steps still parse", normalizeDecisionRow({ steps: decision.steps })?.steps.length === 14);

/* --- Experiment tracker -------------------------------------------- */

console.log("experiments:");
const experiment = normalizeExperimentRow({
  id: "33333333-3333-3333-3333-333333333333",
  title: "Cold-email 50 clinic managers",
  hypothesis: "If I email 50 clinic managers a compliance reminder, 5 will book a call.",
  metric: "Booked calls",
  status: "running",
  started_at: new Date().toISOString(),
  ended_at: null,
  result: {
    expectedResult: "5 booked calls",
    cost: "$0",
    timeRequired: "3 hours",
    failureThreshold: "fewer than 2 replies in 2 weeks",
    outcome: "2 bookings from 50 emails",
    learning: "Clinic managers answer on Tuesdays.",
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
check("dashboard-compatible fields", experiment.title.length > 0 && experiment.status === "running" && experiment.metric === "Booked calls");
check("tracker fields read from the result bag", experiment.cost === "$0" && experiment.timeRequired === "3 hours");
check("learning is stored for the history panel", experiment.learning === "Clinic managers answer on Tuesdays.");
check("unknown status falls back to proposed", normalizeExperimentRow({ title: "x", status: "nonsense" }).status === "proposed");
check(
  "dashboard experiments list still renders from these rows",
  [{ title: experiment.title, hypothesis: experiment.hypothesis, metric: experiment.metric, status: experiment.status, startedAt: experiment.startedAt }].every(
    (row) => typeof row.title === "string" && typeof row.status === "string",
  ),
);

console.log(failures === 0 ? "\nverify-tools: PASS" : `\nverify-tools: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
