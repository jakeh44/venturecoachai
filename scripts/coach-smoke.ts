#!/usr/bin/env bun
/**
 * coach-smoke.ts — verifies the deterministic coach engine with ZERO external
 * dependencies (no DATABASE_URL, no OPENAI_API_KEY).
 *
 *   bun scripts/coach-smoke.ts
 *
 * It drives realistic founder scenarios through every intent and asserts the
 * shapes + the rules that make the product work: the right constraint fires,
 * the stage is detected, the idea analyzer scores all 15 categories, the
 * decision walkthrough has its 14 steps, and nothing ever comes back empty.
 *
 * Exit code 0 = all assertions passed.
 */

import { buildCoachContext, type BusinessFacts, type CoachContext, type FounderIntake } from "../src/server/coach/types";
import { STAGE_SLUGS } from "../src/server/coach/stages";
import { deriveFacts, parseMoney } from "../src/server/coach/intake";
import { runCoachOffline } from "../src/server/coach/engine";
import { BOTTLENECK_RULE_SLUGS } from "../src/server/coach/agents/bottleneck";
import { IDEA_CATEGORY_KEYS, IDEA_WEIGHT_TOTAL } from "../src/server/coach/agents/idea-analysis";
import { DECISION_STEP_COUNT, parseOptions } from "../src/server/coach/agents/decision-guidance";
import { BUSYWORK_PATTERNS, detectBusywork } from "../src/server/coach/agents/busywork";

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = ""): void {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

function context(intake: FounderIntake, extra: Partial<BusinessFacts> = {}, input?: string): CoachContext {
  const facts: BusinessFacts = { ...deriveFacts(intake), ...extra } as BusinessFacts;
  const merged: BusinessFacts = {
    ...buildCoachContext().facts,
    ...(Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined)) as Partial<BusinessFacts>),
  } as BusinessFacts;
  return buildCoachContext({ intake, facts: merged, input, now: new Date("2026-09-04T09:00:00Z") });
}

const SCENARIOS: { name: string; ctx: CoachContext; expectConstraint: string }[] = [
  {
    name: "aspiring founder, no idea yet",
    expectConstraint: "no_clear_problem",
    ctx: context({
      name: "Ada",
      occupation: "marketing manager",
      experience: "none",
      current_business: "no",
      business_idea: "",
      target_customer: "not sure",
      current_revenue: "no revenue yet",
      income_goal: "$8,000/month",
      startup_capital: "$2,000",
      hours_per_week: "15",
      timeline: "12 months",
      skills: "copywriting, ads",
      network_resources: "a few agency contacts",
      biggest_obstacle: "I don't know what to build",
      risk_tolerance: "low",
      business_model: "not sure",
      ambition: "lifestyle business",
    }),
  },
  {
    name: "idea + target customer, zero evidence",
    expectConstraint: "no_validation",
    ctx: context({
      occupation: "physiotherapist",
      experience: "5 years",
      current_business: "no",
      business_idea: "I help clinic owners digitise their intake paperwork so they stop wasting hours on admin",
      target_customer: "small physiotherapy clinic owners with 2-5 staff",
      current_revenue: "0",
      income_goal: "$6,000/month",
      startup_capital: "$5,000",
      hours_per_week: "20",
      skills: "clinical operations, spreadsheets",
      network_resources: "40 clinic owners in my city",
      biggest_obstacle: "I don't know if clinics will pay for this",
      risk_tolerance: "medium",
      business_model: "subscription, $99/month per clinic",
      ambition: "high-growth company",
    }),
  },
  {
    name: "validated interest, still no paying customers",
    expectConstraint: "no_customers",
    ctx: context(
      {
        occupation: "physiotherapist",
        current_business: "no",
        business_idea: "Intake automation for clinics at $99/month per clinic",
        target_customer: "small physiotherapy clinic owners",
        current_revenue: "0",
        hours_per_week: "20",
        biggest_obstacle: "converting interviews into paying clinics",
        business_model: "monthly subscription $99",
      },
      { hasOffer: true, validationEvidence: 3 },
    ),
  },
  {
    name: "two customers, no pipeline",
    expectConstraint: "empty_pipeline",
    ctx: context(
      {
        current_business: "Clinic intake automation, 2 paying clinics",
        business_idea: "Intake automation",
        target_customer: "clinic owners",
        current_revenue: "$600/mo",
        hours_per_week: "25",
        business_model: "subscription $99/month",
      },
      { hasOffer: true, hasPayingCustomers: true, customers: 2, leadsPerMonth: 0 },
    ),
  },
  {
    name: "high churn business",
    expectConstraint: "retention",
    ctx: context(
      {
        current_business: "Membership community for freelance designers, 30 paying members",
        business_idea: "Community + templates",
        target_customer: "freelance designers",
        current_revenue: "$4,000/mo",
        hours_per_week: "40",
        business_model: "monthly membership $29",
      },
      {
        hasOffer: true,
        hasPayingCustomers: true,
        customers: 30,
        leadsPerMonth: 60,
        conversionRate: 0.1,
        churnRate: 0.09,
      },
    ),
  },
  {
    name: "established agency at capacity",
    expectConstraint: "delivery_capacity",
    ctx: context(
      {
        current_business: "B2B content agency with 12 retainer clients, $22k/mo",
        business_idea: "Content retainers for SaaS",
        target_customer: "SaaS marketing leads",
        current_revenue: "$22,000/mo",
        hours_per_week: "55",
        timeline: "scale in 12 months",
        business_model: "monthly retainer $2,500",
      },
      {
        hasOffer: true,
        hasPayingCustomers: true,
        customers: 12,
        leadsPerMonth: 30,
        conversionRate: 0.15,
        churnRate: 0.02,
        documentedProcesses: 0,
        teamSize: 2,
        capacityUtilization: 0.95,
      },
    ),
  },
  {
    name: "established agency with headroom but no processes",
    expectConstraint: "documentation",
    ctx: context(
      {
        current_business: "B2B content agency with 12 retainer clients, $22k/mo",
        business_idea: "Content retainers for SaaS",
        target_customer: "SaaS marketing leads",
        current_revenue: "$22,000/mo",
        hours_per_week: "45",
        business_model: "monthly retainer $2,500",
      },
      {
        hasOffer: true,
        hasPayingCustomers: true,
        customers: 12,
        leadsPerMonth: 30,
        conversionRate: 0.15,
        churnRate: 0.02,
        documentedProcesses: 0,
        teamSize: 2,
        capacityUtilization: 0.6,
      },
    ),
  },
];

console.log("coach engine smoke test (deterministic path, no keys, no DB)\n");

console.log("intake parsing");
check("parseMoney('$2,500/mo') === 2500", parseMoney("$2,500/mo") === 2500, String(parseMoney("$2,500/mo")));
check("parseMoney('about 10k') === 10000", parseMoney("about 10k") === 10000, String(parseMoney("about 10k")));
check("parseMoney('no revenue yet') === null", parseMoney("no revenue yet") === null);
check("deriveFacts flags pre-revenue as 0", deriveFacts({ current_revenue: "no revenue yet" }).monthlyRevenue === 0);
check(
  "deriveFacts rejects 'everyone' as a target customer",
  deriveFacts({ target_customer: "everyone" }).hasTargetCustomer === false,
);

console.log("\nconstraint detection (rule chain)");
check("rule chain has 14 named rules before the stage fallback", BOTTLENECK_RULE_SLUGS.length >= 13, String(BOTTLENECK_RULE_SLUGS.length));
for (const scenario of SCENARIOS) {
  const result = await runCoachOffline("bottleneck", scenario.ctx);
  const data = result.data;
  check(
    `${scenario.name} → ${scenario.expectConstraint}`,
    data.slug === scenario.expectConstraint,
    `got ${data.slug}`,
  );
  check(`  ${scenario.name}: constraint is a real sentence`, data.constraint.length > 8);
  check(`  ${scenario.name}: has evidence, action and metric`, data.evidence.length > 0 && data.nextAction.length > 20 && data.metricToWatch.name.length > 0);
  check(`  ${scenario.name}: names what NOT to optimise`, data.doNotOptimize.length > 0);
}

console.log("\nstage detection");
for (const scenario of SCENARIOS) {
  const result = await runCoachOffline("stage_detection", scenario.ctx);
  check(
    `${scenario.name} → stage "${result.data.stage}" is valid`,
    (STAGE_SLUGS as readonly string[]).includes(result.data.stage),
    result.data.stage,
  );
  check(`  ${scenario.name}: 10 milestones reported`, result.data.milestones.length === 10, String(result.data.milestones.length));
  check(`  ${scenario.name}: why is a real explanation`, result.data.why.length > 30);
}

console.log("\ndaily priorities");
{
  const result = await runCoachOffline("daily_priorities", SCENARIOS[3].ctx);
  const data = result.data;
  check("top task has a title + doneWhen", data.topTask.title.length > 5 && data.topTask.doneWhen.length > 5);
  check("second priority present", data.second.title.length > 5);
  check("optional task is optional (nullable)", data.optional === null || data.optional.title.length > 5);
  check("metric has a name and a daily target", data.metric.name.length > 0 && data.metric.target.length > 0);
  check("one coaching question, ends with '?'", data.coachingQuestion.endsWith("?"));
  check("anti-busywork list is non-empty", data.avoid.length >= 2, JSON.stringify(data.avoid.map((a) => a.item)));
  check("focus note names the constraint", /constraint/i.test(data.focusNote));
  check("est. minutes is a sane number", data.topTask.estMinutes >= 5 && data.topTask.estMinutes <= 480);
}

console.log("\nanti-busywork guard");
check("detects a website redesign plan", detectBusywork("today I will redesign the website and pick a logo").length >= 2);
check("pattern list is substantial", BUSYWORK_PATTERNS.length >= 8);
{
  const result = await runCoachOffline(
    "daily_priorities",
    context(SCENARIOS[3].ctx.intake, { hasOffer: true, customers: 2, hasPayingCustomers: true, leadsPerMonth: 0 }, "Build the new logo and post on social media"),
  );
  check("flags the founder's own busywork plan", result.data.avoid.some((entry) => /logo|social/i.test(entry.item)), JSON.stringify(result.data.avoid));
}

console.log("\nweekly plan");
{
  const result = await runCoachOffline("weekly_plan", SCENARIOS[4].ctx);
  const data = result.data;
  check("one objective", data.objective.length > 10);
  check("exactly 3 priorities", data.priorities.length === 3, String(data.priorities.length));
  check("action items have doneWhen + effort", data.actions.every((a) => a.doneWhen.length > 0 && a.effort.length > 0));
  check("metrics >= 1", data.metrics.length >= 1);
  check("experiment has hypothesis + threshold + duration", Boolean(data.experiment.hypothesis && data.experiment.successThreshold && data.experiment.durationDays > 0));
  check("accountability has commitment + check-in + consequence", Boolean(data.accountability.commitment && data.accountability.checkIn && data.accountability.consequence));
  check("one coaching question", data.coachingQuestion.endsWith("?"));
  check("stage focus present", data.stageFocus.includes(":"));
}

console.log("\nidea analysis (15 categories)");
{
  const result = await runCoachOffline("idea_analysis", SCENARIOS[2].ctx);
  const data = result.data;
  check("15 categories scored", data.categories.length === 15, String(data.categories.length));
  check("category keys are stable", IDEA_CATEGORY_KEYS.every((key) => data.categories.some((c) => c.key === key)));
  check("weights sum to 1.0", Math.abs(IDEA_WEIGHT_TOTAL - 1) < 1e-9, String(IDEA_WEIGHT_TOTAL));
  check("every score is 1..10", data.categories.every((c) => c.score >= 1 && c.score <= 10));
  check("overall score is 10..100", data.overallScore >= 10 && data.overallScore <= 100, String(data.overallScore));
  check("grade + verdict + summary present", Boolean(data.grade && data.verdict && data.summary));
  check("KNOWN/ASSUMED/UNKNOWN all populated", data.knownAssumedUnknown.known.length > 0 && data.knownAssumedUnknown.assumed.length > 0 && data.knownAssumedUnknown.unknown.length > 0);
  check("validation plan has 3-4 cheap tests", data.validationPlan.length >= 3 && data.validationPlan.length <= 4, String(data.validationPlan.length));
  check("every test has a numeric success signal", data.validationPlan.every((s) => s.successSignal.length > 5 && s.method.length > 20));
  check("strengths/risks derived from the scores", data.strengths.length + data.risks.length > 0);
}

console.log("\nvalidation plan (standalone)");
{
  const result = await runCoachOffline("validation_plan", SCENARIOS[2].ctx);
  check("assumptions risk-ranked", result.data.assumptions.length >= 5 && result.data.assumptions[0].risk === "high");
  check("kill criteria stated", result.data.killCriteria.length > 40);
  check("cost/time summary present", Boolean(result.data.totalCost && result.data.totalTime));
}

console.log("\ndecision guidance (14 steps)");
{
  const result = await runCoachOffline("decision_guidance", {
    ...SCENARIOS[5].ctx,
    input: "Do it now: hire a full-time account manager | Do it in 30 days | Do not do it",
    options: ["Hire a full-time account manager now", "Hire a part-time contractor in 30 days", "Do not hire, systemise first"],
  });
  const data = result.data;
  check("14 framework steps", data.steps.length === DECISION_STEP_COUNT && DECISION_STEP_COUNT === 14, String(data.steps.length));
  check("every step has a question + guidance", data.steps.every((s) => s.question.endsWith("?") && s.guidance.length > 20));
  check("criteria weights sum to 1.0", Math.abs(data.criteria.reduce((sum, c) => sum + c.weight, 0) - 1) < 1e-9);
  check("3 options scored 0..100", data.options.length === 3 && data.options.every((o) => o.score >= 0 && o.score <= 100));
  check("a recommendation with a WHY exists", Boolean(data.recommendation && data.recommendation.why.length > 40));
  check("recommendation names a real option", data.options.some((o) => o.label === data.recommendation?.choice));
  check("whyNot explains the losers", data.whyNot.length === 2);
  check("one-way door detected for a hiring/quit decision", data.doorType === "one_way_door", data.doorType);
  check("first step + reversal condition present", Boolean(data.recommendation?.firstStep && data.recommendation?.reversesIf));

  const noOptions = await runCoachOffline("decision_guidance", { ...SCENARIOS[2].ctx, input: "Should I raise my price?" });
  check("with no options it runs the default frame + still recommends", noOptions.data.options.length === 3 && Boolean(noOptions.data.recommendation));
  check("parseOptions() splits A) / | lines", parseOptions("- Do it now | Wait a month").length === 2);
}

console.log("\nenvelope");
{
  const result = await runCoachOffline("bottleneck", SCENARIOS[0].ctx);
  check("source is deterministic without a key", result.source === "deterministic");
  check("generatedAt is an ISO timestamp", !Number.isNaN(Date.parse(result.generatedAt)));
  check("intent is echoed", result.intent === "bottleneck");
}

console.log(`\n${checks - failures}/${checks} assertions passed`);
if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log("coach engine: deterministic path OK");
