/**
 * weekly-plan.ts — one objective, three priorities, one experiment.
 *
 * The weekly plan is the accountability layer: a single measurable objective,
 * no more than three priorities, the actions that deliver them, the metrics
 * that decide it, exactly one experiment, and a commitment with a check-in.
 */

import { resolveStageInfo } from "./stage-resolver";
import type { CoachAgent, CoachContext, MetricTarget, WeeklyPlanData } from "../types";
import { deterministicBottleneck } from "./bottleneck";
import { antiBusyworkAdvice } from "./busywork";
import {
  COACH_PERSONA,
  JSON_INSTRUCTION,
  asRecord,
  coerceMetric,
  contextDigest,
  optString,
  reqString,
  stringArray,
  weekStart,
} from "./util";

interface ExperimentTemplate {
  title: string;
  hypothesis: string;
  metric: string;
  successThreshold: string;
  durationDays: number;
}

const EXPERIMENT_BY_CONSTRAINT: Record<string, ExperimentTemplate> = {
  no_clear_problem: {
    title: "Problem-immersion week",
    hypothesis: "Talking to 10 potential buyers will surface one problem worth building around",
    metric: "problems that appear unprompted in 6+ of 10 conversations",
    successThreshold: "one problem named by 6+ people",
    durationDays: 7,
  },
  undefined_customer: {
    title: "Two-segment A/B conversations",
    hypothesis: "One of two candidate segments describes the pain more urgently and specifically",
    metric: "urgent, specific pain described in conversation",
    successThreshold: "5 of 10 conversations in one segment describe the pain without prompting",
    durationDays: 7,
  },
  no_offer: {
    title: "Offer comprehension test",
    hypothesis: "A priced, outcome-based offer is repeatable back by prospects",
    metric: "people who paraphrase the offer correctly",
    successThreshold: "3 of 5 paraphrase it correctly and 1 asks how to start",
    durationDays: 7,
  },
  no_validation: {
    title: "Deposit ask test",
    hypothesis: "Qualified prospects will commit money before the product is finished",
    metric: "deposits collected at full price",
    successThreshold: "1 deposit from 10 asks",
    durationDays: 10,
  },
  no_customers: {
    title: "20-outreach volume test",
    hypothesis: "Direct personal outreach at volume produces the first paying customer",
    metric: "payments from direct outreach",
    successThreshold: "1 payment from 20 named prospects contacted",
    durationDays: 7,
  },
  empty_pipeline: {
    title: "One-channel volume test",
    hypothesis: "A single channel can produce 5 qualified conversations a week",
    metric: "new qualified conversations per week",
    successThreshold: "5 conversations in 7 days from one channel",
    durationDays: 7,
  },
  conversion: {
    title: "Objection-removal test",
    hypothesis: "Removing the most common objection in the offer lifts conversion",
    metric: "conversion rate over the next 10 qualified conversations",
    successThreshold: "2× the previous conversion rate",
    durationDays: 14,
  },
  retention: {
    title: "Churn-reason follow-up test",
    hypothesis: "One repeated churn reason explains most losses and can be fixed in delivery",
    metric: "repeat rate of the top churn reason",
    successThreshold: "top reason identified from 3+ exit calls and one fix shipped",
    durationDays: 10,
  },
  delivery_capacity: {
    title: "Delivery time-cut test",
    hypothesis: "The two slowest delivery steps can be removed or templated without hurting the outcome",
    metric: "founder minutes per delivery",
    successThreshold: "30% fewer minutes with the same customer outcome",
    durationDays: 14,
  },
  documentation: {
    title: "Checklist-run test",
    hypothesis: "Delivery run from a written checklist is faster and more consistent",
    metric: "deliveries completed from the checklist",
    successThreshold: "3 processes documented and each used once",
    durationDays: 10,
  },
  acquisition: {
    title: "Channel instrument test",
    hypothesis: "The best existing channel can be measured, forecast and doubled",
    metric: "customers and cost per customer per channel",
    successThreshold: "one channel with a predictable weekly customer number",
    durationDays: 14,
  },
  margin: {
    title: "Margin ranking test",
    hypothesis: "A minority of services/customers produce most of the profit",
    metric: "contribution margin per delivery",
    successThreshold: "top and bottom margin offers ranked, one price raised",
    durationDays: 14,
  },
  founder_bottleneck: {
    title: "Handoff test",
    hypothesis: "One fully documented task can be handed off without quality loss",
    metric: "tasks completed without founder involvement",
    successThreshold: "1 task handed off and completed to the definition of done",
    durationDays: 14,
  },
  no_decision: {
    title: "Valuation and options test",
    hypothesis: "A priced valuation range makes sell / hold / compound decidable",
    metric: "valuation range and decision date written",
    successThreshold: "range produced and the deciding number documented",
    durationDays: 14,
  },
};

const STAGE_EXPERIMENT: ExperimentTemplate = {
  title: "Stage-milestone test",
  hypothesis: "Thirty focused days on the current stage's milestone moves the stage's metric",
  metric: "the stage's own metric",
  successThreshold: "the milestone condition becomes observably true",
  durationDays: 7,
};

export function deterministicWeeklyPlan(ctx: CoachContext): WeeklyPlanData {
  const constraint = deterministicBottleneck(ctx);
  const stage = resolveStageInfo(ctx);
  const experimentTemplate = EXPERIMENT_BY_CONSTRAINT[constraint.slug] ?? STAGE_EXPERIMENT;

  const objective =
    ctx.coaching?.weeklyObjective ??
    `Break your constraint: ${constraint.constraint}`;

  const priorities = [
    constraint.nextAction,
    `Push ${stage.label} forward: ${stage.milestone}`,
    `Report the number weekly: ${constraint.metricToWatch.name} → ${constraint.metricToWatch.target}`,
  ].slice(0, 3);

  const actions = [
    {
      title: constraint.nextAction,
      doneWhen: `Done by Friday — measurable, with the number recorded`,
      effort: "3–5h",
    },
    {
      title: `Start the experiment: ${experimentTemplate.title}`,
      doneWhen: `Running by day 2 with ${experimentTemplate.metric} tracked`,
      effort: "2–4h",
    },
    {
      title: `Block one 90-minute session on the ${stage.label} milestone this week`,
      doneWhen: "Session in the calendar, treated as a customer meeting",
      effort: "1.5h",
    },
  ];

  const metrics: MetricTarget[] = [
    constraint.metricToWatch,
    {
      name: "Anti-busywork count",
      target: "0 hours on the things listed as 'avoid'",
      why: "Protected focus is the scarce resource, not ideas.",
    },
  ];

  return {
    weekOf: weekStart(ctx.now),
    objective,
    priorities,
    actions,
    metrics,
    experiment: experimentTemplate,
    accountability: {
      commitment: `By Friday, ${constraint.metricToWatch.name} has moved: ${constraint.metricToWatch.target}.`,
      checkIn: "Log the number every evening in the dashboard; weekly review on Friday before you stop working.",
      consequence:
        "If you fall two days behind, cut scope or drop a priority — never move the commitment or the date.",
    },
    coachingQuestion: `What is the single obstacle most likely to stop this objective this week, and what will you do about it before Wednesday?`,
    stageFocus: `${stage.label}: ${stage.focus}`,
  };
}

const SYSTEM = `${COACH_PERSONA}\n\nYou produce weekly operating plans: one objective, at most three priorities, one experiment, one commitment. ${JSON_INSTRUCTION}`;

export const weeklyPlanAgent: CoachAgent<"weekly_plan"> = {
  intent: "weekly_plan",
  label: "Weekly coach",
  feature: "weekly_plan",
  deterministic: deterministicWeeklyPlan,
  buildPrompt(ctx) {
    const base = deterministicWeeklyPlan(ctx);
    const constraint = deterministicBottleneck(ctx);
    return {
      system: SYSTEM,
      user: [
        contextDigest(ctx),
        "",
        `BINDING CONSTRAINT: ${constraint.constraint}`,
        `DO NOT OPTIMISE: ${constraint.doNotOptimize}`,
        `AVOID THIS WEEK: ${constraint.doNotOptimize}`,
        "",
        "Deterministic baseline (correct it where the evidence disagrees, keep the shape):",
        JSON.stringify({ objective: base.objective, priorities: base.priorities, experiment: base.experiment }),
        "",
        "Return JSON: {\"objective\":\"one measurable objective\",\"priorities\":[\"...\",\"...\",\"...\"],\"actions\":[{\"title\":\"...\",\"doneWhen\":\"...\",\"effort\":\"3h\"}],\"metrics\":[{\"name\":\"...\",\"target\":\"...\",\"why\":\"...\"}],\"experiment\":{\"title\":\"...\",\"hypothesis\":\"...\",\"metric\":\"...\",\"successThreshold\":\"...\",\"durationDays\":7},\"accountability\":{\"commitment\":\"...\",\"checkIn\":\"...\",\"consequence\":\"...\"},\"coachingQuestion\":\"...\",\"stageFocus\":\"...\",\"avoid\":[{\"item\":\"...\",\"reason\":\"...\"}]}",
      ].join("\n"),
    };
  },
  validate(raw, ctx) {
    const record = asRecord(raw);
    const base = deterministicWeeklyPlan(ctx);
    const priorities = stringArray(record.priorities, 3);
    const metrics = Array.isArray(record.metrics)
      ? record.metrics
          .slice(0, 3)
          .map((entry, index) =>
            coerceMetric(entry, base.metrics[index] ?? base.metrics[0] ?? { name: "Metric", target: "move it" }),
          )
      : base.metrics;
    const experimentRaw = record.experiment;
    const experimentRecord =
      experimentRaw && typeof experimentRaw === "object" ? (experimentRaw as Record<string, unknown>) : {};
    const actions = Array.isArray(record.actions)
      ? record.actions
          .slice(0, 5)
          .map((entry, index) => {
            const row = asRecord(entry);
            const fallback = base.actions[index] ?? base.actions[0];
            return {
              title: optString(row, "title", fallback?.title ?? "Action"),
              doneWhen: optString(row, "doneWhen", fallback?.doneWhen ?? "by Friday"),
              effort: optString(row, "effort", fallback?.effort ?? "2h"),
            };
          })
      : base.actions;
    const accountabilityRaw = record.accountability;
    const accountabilityRecord =
      accountabilityRaw && typeof accountabilityRaw === "object"
        ? (accountabilityRaw as Record<string, unknown>)
        : {};
    return {
      ...base,
      objective: reqString(record, "objective"),
      priorities: priorities.length > 0 ? priorities : base.priorities,
      actions: actions.length > 0 ? actions : base.actions,
      metrics,
      experiment: {
        title: optString(experimentRecord, "title", base.experiment.title),
        hypothesis: optString(experimentRecord, "hypothesis", base.experiment.hypothesis),
        metric: optString(experimentRecord, "metric", base.experiment.metric),
        successThreshold: optString(experimentRecord, "successThreshold", base.experiment.successThreshold),
        durationDays: Math.round(
          Math.min(60, Math.max(1, Number(experimentRecord.durationDays) || base.experiment.durationDays)),
        ),
      },
      accountability: {
        commitment: optString(accountabilityRecord, "commitment", base.accountability.commitment),
        checkIn: optString(accountabilityRecord, "checkIn", base.accountability.checkIn),
        consequence: optString(accountabilityRecord, "consequence", base.accountability.consequence),
      },
      coachingQuestion: reqString(record, "coachingQuestion"),
      stageFocus: optString(record, "stageFocus", base.stageFocus),
    };
  },
};

/**
 * The anti-busywork list is produced by the same guard as the daily plan; it is
 * surfaced through the weekly plan too so the dashboard can render it once.
 */
export function weeklyAvoidances(ctx: CoachContext): { item: string; reason: string }[] {
  return antiBusyworkAdvice(ctx, deterministicBottleneck(ctx).doNotOptimize);
}
