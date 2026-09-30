/**
 * scripts/verify-coach.ts — offline smoke test for the coached loop.
 *
 * Runs the deterministic engine end-to-end over a sample intake (no database, no
 * LLM keys) and asserts the exact payload the dashboard renders. Run it after
 * touching any agent under src/server/coach/agents:
 *
 *   bun scripts/verify-coach.ts
 *
 * Exits non-zero if any dashboard-required field is missing, so it doubles as a
 * regression check for the dashboard contract.
 */

import { runCoachOffline } from "../src/server/coach/engine";
import { computeHealthScore } from "../src/server/coach/health";
import { deriveFacts } from "../src/server/coach/intake";
import { buildCoachContext, emptyFacts } from "../src/server/coach/types";

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
  timeline: "6 months",
  skills: "design, branding",
  network_resources: "30 cafe owners I know",
  biggest_obstacle: "not enough leads",
  risk_tolerance: "medium",
  business_model: "subscription",
  ambition: "replace my freelance income",
};

const facts = { ...emptyFacts(), ...deriveFacts(intake) };
const base = buildCoachContext({ userId: "verify", intake, facts });
const stage = await runCoachOffline("stage_detection", base);
const ctx = { ...base, facts: { ...facts, stage: stage.data.stage } };
const bottleneck = await runCoachOffline("bottleneck", ctx);
const daily = await runCoachOffline("daily_priorities", ctx);
const weekly = await runCoachOffline("weekly_plan", ctx);
const health = computeHealthScore(ctx);

const checks: [string, boolean][] = [
  ["stage detected", Boolean(stage.data.stage && stage.data.label && stage.data.why)],
  ["roadmap is 10 stages", stage.data.total === 10 && stage.data.index >= 1],
  [
    "constraint complete (why / next action / metric / do-not-optimize)",
    Boolean(
      bottleneck.data.constraint &&
        bottleneck.data.why &&
        bottleneck.data.nextAction &&
        bottleneck.data.metricToWatch?.name &&
        bottleneck.data.doNotOptimize &&
        bottleneck.data.improvesWhen,
    ),
  ],
  [
    "today complete (top / second / metric / question)",
    Boolean(
      daily.data.topTask?.title &&
        daily.data.topTask?.doneWhen &&
        daily.data.second?.title &&
        daily.data.metric?.name &&
        daily.data.coachingQuestion,
    ),
  ],
  ["anti-busywork advice present", daily.data.avoid.length > 0],
  [
    "week complete (objective / 3 priorities / experiment)",
    Boolean(
      weekly.data.objective &&
        weekly.data.priorities.length >= 3 &&
        weekly.data.experiment?.title &&
        weekly.data.experiment?.successThreshold &&
        weekly.data.accountability?.commitment,
    ),
  ],
  ["health has 7 dimensions + band", health.components.length === 7 && Boolean(health.band)],
];

console.log(`stage      : ${stage.data.label} (${stage.data.stage}) — ${stage.data.progress}% — ${stage.source}`);
console.log(`constraint : ${bottleneck.data.constraint} [${bottleneck.data.severity}]`);
console.log(`don't do   : ${bottleneck.data.doNotOptimize}`);
console.log(`today      : ${daily.data.topTask.title}`);
console.log(`avoid      : ${daily.data.avoid.map((entry) => entry.item).join(" | ")}`);
console.log(`objective  : ${weekly.data.objective}`);
console.log(`experiment : ${weekly.data.experiment.title}`);
console.log(`health     : ${health.score}/100 (${health.band}) — weakest: ${health.weakest}`);

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
}
console.log(failed ? `RESULT: ${failed} check(s) FAILED` : "RESULT: all checks passed");
process.exit(failed ? 1 : 0);
