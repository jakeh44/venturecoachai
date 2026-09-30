/**
 * daily-priorities.ts — "What matters today?"
 *
 * One highest-leverage task, a second priority, an optional stretch task, the
 * metric to move, and one coaching question. The #1 task is always the next
 * move on the binding constraint — never a to-do list.
 */

import { resolveStageInfo } from "./stage-resolver";
import type { CoachAgent, CoachContext, DailyPrioritiesData, PriorityTask } from "../types";
import { deterministicBottleneck } from "./bottleneck";
import { antiBusyworkAdvice } from "./busywork";
import {
  COACH_PERSONA,
  JSON_INSTRUCTION,
  asRecord,
  coerceMetric,
  coerceTask,
  contextDigest,
  isoDate,
  optString,
  reqString,
  stringArray,
} from "./util";

interface TaskTemplate {
  title: string;
  why: string;
  estMinutes: number;
  doneWhen: string;
}

/** Today's concrete version of each constraint's next action. */
const TASK_BY_CONSTRAINT: Record<string, TaskTemplate> = {
  no_clear_problem: {
    title: "Write your one-sentence problem statement",
    why: "Everything downstream is guesswork until you can name one customer and one outcome.",
    estMinutes: 45,
    doneWhen: "One sentence: \"I help [customer] get [outcome] without [pain]\" — written down and said out loud.",
  },
  undefined_customer: {
    title: "Pick ONE segment and list 20 named people in it",
    why: "A segment is only real when you can write down actual names inside it.",
    estMinutes: 60,
    doneWhen: "20 specific names/companies listed in one place, in your target segment.",
  },
  no_offer: {
    title: "Write the offer one-pager: outcome, timeframe, price, exclusions",
    why: "Without a price you cannot tell interest from politeness.",
    estMinutes: 60,
    doneWhen: "One page you could send to a prospect today: outcome, timeframe, price, what is not included.",
  },
  no_validation: {
    title: "Ask 3 qualified prospects for a deposit at full price",
    why: "Only a paid commitment falsifies the idea cheaply.",
    estMinutes: 90,
    doneWhen: "3 asks made (deposit or prepaid pilot), objections written down verbatim.",
  },
  no_customers: {
    title: "Send 10 personal outreach messages to named prospects",
    why: "20 attempts is the cheapest path to the first payment — volume beats polish.",
    estMinutes: 75,
    doneWhen: "10 messages sent to specific people plus 5 follow-ups, tracked in one list.",
  },
  empty_pipeline: {
    title: "Start 5 new conversations from ONE channel",
    why: "Revenue this month is already earned; next month depends on conversations starting today.",
    estMinutes: 60,
    doneWhen: "5 new conversations opened from a single named channel (referrals count first).",
  },
  conversion: {
    title: "Read your last 10 lost conversations and name the top objection",
    why: "More traffic multiplies the leak; the objection is the constraint.",
    estMinutes: 45,
    doneWhen: "The most repeated objection written at the top of a page, with a revised sentence to handle it.",
  },
  retention: {
    title: "Call 3 churned customers and record the real reason",
    why: "Acquisition spend is wasted until you know why buyers leave.",
    estMinutes: 60,
    doneWhen: "3 calls done, reasons written verbatim, the most repeated one identified.",
  },
  delivery_capacity: {
    title: "Time one delivery end-to-end and list the 2 slowest steps",
    why: "Throughput per founder hour is the ceiling on everything else.",
    estMinutes: 90,
    doneWhen: "Timings recorded for every step; the two slowest steps named.",
  },
  documentation: {
    title: "Write the delivery checklist while you deliver",
    why: "Undocumented work cannot be delegated, priced reliably, or repeated.",
    estMinutes: 60,
    doneWhen: "A numbered checklist exists and the next delivery ran from it.",
  },
  acquisition: {
    title: "Instrument your best channel: last week's customers and cost",
    why: "A channel you can forecast is the entry ticket to scale.",
    estMinutes: 45,
    doneWhen: "Customers per channel and cost per customer written down from real last-week numbers.",
  },
  margin: {
    title: "Price one delivery: revenue, direct cost, hours",
    why: "Growth on negative unit economics grows the problem.",
    estMinutes: 45,
    doneWhen: "Contribution margin per delivery calculated and compared with your hourly goal.",
  },
  founder_bottleneck: {
    title: "List last week's recurring tasks and pick one to hand off",
    why: "The founder is the throughput limit of an otherwise working business.",
    estMinutes: 45,
    doneWhen: "One documented task handed to a person or automation with a written definition of done.",
  },
  no_decision: {
    title: "Run the Decision Engine on sell / hold / compound",
    why: "An unpriced asset cannot be compared with any alternative.",
    estMinutes: 60,
    doneWhen: "Three options written with the number and date that would decide between them.",
  },
};

/** Second priority: the stage milestone's supporting move. */
function secondTask(ctx: CoachContext): PriorityTask {
  const stage = resolveStageInfo(ctx);
  const bySlug: Partial<Record<string, TaskTemplate>> = {
    find: {
      title: "Book 2 conversations with people in your target segment",
      why: "Find is decided by conversations, not by thinking.",
      estMinutes: 30,
      doneWhen: "2 calls booked in the calendar this week.",
    },
    validate: {
      title: "Document the strongest validation signal you already have",
      why: "Evidence you cannot quote is evidence you will forget when doubt hits.",
      estMinutes: 30,
      doneWhen: "One page: what was said, by whom, and what they paid or committed.",
    },
    offer: {
      title: "Get 3 people to repeat your offer back unprompted",
      why: "A clear offer survives paraphrasing.",
      estMinutes: 30,
      doneWhen: "3 paraphrases written down; gaps in the wording fixed.",
    },
    sell: {
      title: "Follow up every open conversation today",
      why: "Most sales happen in the follow-up, not the first message.",
      estMinutes: 30,
      doneWhen: "Every open thread has a next step and a date.",
    },
    deliver: {
      title: "Ask one current customer for their outcome in their words",
      why: "Delivery quality is proven by the customer's statement, not your effort.",
      estMinutes: 25,
      doneWhen: "One quotable outcome sentence collected (with permission).",
    },
    systemize: {
      title: "Document the second-most time-consuming process",
      why: "Two checklists are the difference between a business and a job.",
      estMinutes: 45,
      doneWhen: "A numbered checklist that someone else could run tomorrow.",
    },
    scale: {
      title: "Double down on the channel that produced last week's customers",
      why: "Mastering one channel beats sampling five.",
      estMinutes: 45,
      doneWhen: "A concrete volume increase scheduled this week in one channel.",
    },
    optimize: {
      title: "Fix the biggest margin leak you already know about",
      why: "Margin buys time; revenue alone does not.",
      estMinutes: 45,
      doneWhen: "The leak is quantified and one change is live.",
    },
    delegate: {
      title: "Write the definition of done for one delegated task",
      why: "Delegation without a definition of done comes straight back to you.",
      estMinutes: 30,
      doneWhen: "One page a team member could act on without asking you.",
    },
    "exit-or-compound": {
      title: "Get one comparable business valuation range",
      why: "You cannot decide on an asset you have not priced.",
      estMinutes: 45,
      doneWhen: "A valuation range and the multiple it implies, written down.",
    },
  };
  const template = bySlug[stage.slug] ?? {
    title: `Advance the ${stage.label} milestone`,
    why: stage.focus,
    estMinutes: 45,
    doneWhen: stage.milestone,
  };
  return template;
}

/** Optional stretch: build the reusable asset behind the constraint. */
function optionalTask(constraintSlug: string): PriorityTask {
  const generic: PriorityTask = {
    title: "Write the reusable asset for your constraint (one-pager, script or checklist)",
    why: "The second time you do this work it should be faster than the first.",
    estMinutes: 30,
    doneWhen: "An asset you could reuse in the next conversation without rewriting it.",
  };
  if (constraintSlug === "no_customers" || constraintSlug === "empty_pipeline") {
    return {
      title: "Write your 3-line outreach script and one follow-up template",
      why: "Scripts make volume sustainable instead of exhausting.",
      estMinutes: 30,
      doneWhen: "One opener and one follow-up template saved where you send messages.",
    };
  }
  if (constraintSlug === "retention") {
    return {
      title: "Add a 7-day and 30-day check-in to every new customer",
      why: "Retention is usually a follow-up problem, not a product problem.",
      estMinutes: 30,
      doneWhen: "Two scheduled check-ins exist for every current customer.",
    };
  }
  return generic;
}

const QUESTIONS: Record<string, string> = {
  no_clear_problem: "Which problem have you personally been paid to solve, or lived painfully enough to fix for someone else?",
  undefined_customer: "Who exactly is the person you would be embarrassed to lose as a customer?",
  no_offer: "What outcome would make your customer say the price was obviously worth it?",
  no_validation: "If nobody pays in the next 14 days, what will you change first — segment, offer, or price?",
  no_customers: "What number of attempts have you actually made so far — and what will you do differently for the next 20?",
  empty_pipeline: "Which single channel will you still be running in 90 days, and what does it produce per 20 sends?",
  conversion: "What is the one objection you keep hearing, and what would you have to change to remove it?",
  retention: "What did customers expect that they did not get — and is that a delivery problem or an expectation problem?",
  delivery_capacity: "Which single step in delivery consumes the most hours, and can it be removed rather than optimised?",
  documentation: "If you were unavailable for two weeks, which process would break first?",
  acquisition: "What does one customer actually cost you in time and money today?",
  margin: "Which of your customers or services makes you the most money per hour — and why are you not doing more of that?",
  founder_bottleneck: "Which decision last week did not actually need you?",
  no_decision: "What specific number — sale price or annual owner cash flow — would make this decision easy?",
  stage_focus: "What would have to be true in 30 days for you to call this stage complete?",
};

export function deterministicDailyPriorities(ctx: CoachContext): DailyPrioritiesData {
  const constraint = deterministicBottleneck(ctx);
  const stage = resolveStageInfo(ctx);
  const template = TASK_BY_CONSTRAINT[constraint.slug];
  const topTask: PriorityTask = template ?? {
    title: `Work the ${stage.label} milestone: ${stage.milestone}`,
    why: constraint.why,
    estMinutes: 60,
    doneWhen: stage.milestone,
  };

  const objective =
    ctx.coaching?.weeklyObjective ??
    `Break the constraint: ${constraint.constraint}`;

  const dailyTarget = template
    ? topTask.doneWhen
    : `Observable progress on ${stage.metric} today`;

  const avoid = antiBusyworkAdvice(ctx, constraint.doNotOptimize);

  return {
    date: isoDate(ctx.now),
    headline: `What matters today: ${topTask.title}`,
    objective,
    topTask,
    second: secondTask(ctx),
    optional: optionalTask(constraint.slug),
    metric: {
      name: constraint.metricToWatch.name,
      target: dailyTarget,
      why: constraint.metricToWatch.why ?? `This is how ${stage.label} gets decided.`,
    },
    coachingQuestion: QUESTIONS[constraint.slug] ?? QUESTIONS.stage_focus,
    avoid,
    focusNote: `Your constraint is ${constraint.constraint.toLowerCase()}. Do not optimise ${constraint.doNotOptimize} until it improves. Everything else on your list today is optional.`,
  };
}

const SYSTEM = `${COACH_PERSONA}\n\nYou are a daily-priorities engine. You produce at most three tasks for today, led by the next move on the binding constraint. You actively refuse busywork. ${JSON_INSTRUCTION}`;

export const dailyPrioritiesAgent: CoachAgent<"daily_priorities"> = {
  intent: "daily_priorities",
  label: "Daily priorities",
  feature: "daily_priorities",
  deterministic: deterministicDailyPriorities,
  buildPrompt(ctx) {
    const base = deterministicDailyPriorities(ctx);
    const constraint = deterministicBottleneck(ctx);
    return {
      system: SYSTEM,
      user: [
        contextDigest(ctx),
        "",
        `BINDING CONSTRAINT: ${constraint.constraint}`,
        `DO NOT OPTIMISE UNTIL IT IMPROVES: ${constraint.doNotOptimize}`,
        `CONSTRAINT NEXT ACTION: ${constraint.nextAction}`,
        "",
        "Deterministic baseline for today (correct it if the evidence disagrees, keep the shape):",
        JSON.stringify({ topTask: base.topTask, second: base.second, metric: base.metric }),
        "",
        "Return JSON: {\"objective\":\"...\",\"topTask\":{\"title\":\"...\",\"why\":\"...\",\"estMinutes\":60,\"doneWhen\":\"...\"},\"second\":{...},\"optional\":{...}|null,\"metric\":{\"name\":\"...\",\"target\":\"...\",\"why\":\"...\"},\"coachingQuestion\":\"one question that forces a decision\",\"focusNote\":\"2 sentences naming the constraint and what NOT to do today\"}",
      ].join("\n"),
    };
  },
  validate(raw, ctx) {
    const record = asRecord(raw);
    const base = deterministicDailyPriorities(ctx);
    const optionalRaw = record.optional;
    const avoid = Array.isArray(record.avoid)
      ? record.avoid
          .slice(0, 3)
          .map((entry) => {
            const row = asRecord(entry);
            return { item: optString(row, "item", ""), reason: optString(row, "reason", "") };
          })
          .filter((entry) => entry.item)
      : stringArray(record.avoid, 3).map((item) => ({ item, reason: "Flagged by the anti-busywork guard." }));
    return {
      ...base,
      headline: optString(record, "headline", base.headline),
      objective: optString(record, "objective", base.objective),
      topTask: coerceTask(record.topTask, base.topTask),
      second: coerceTask(record.second, base.second),
      optional:
        optionalRaw === null
          ? null
          : optionalRaw === undefined
            ? base.optional
            : coerceTask(optionalRaw, base.optional ?? base.second),
      metric: coerceMetric(record.metric, base.metric),
      coachingQuestion: reqString(record, "coachingQuestion"),
      avoid: avoid.length > 0 ? avoid : base.avoid,
      focusNote: optString(record, "focusNote", base.focusNote),
    };
  },
};
