/**
 * bottleneck.ts — "Find the Constraint", the product's differentiator.
 *
 * An ordered rule chain over the founder's facts. The FIRST rule that matches
 * wins, so the coach names exactly one binding constraint (never a list) and
 * explicitly forbids optimising the tempting-but-wrong lever.
 *
 * Order (per the product brief, extended with the stages it implies):
 *   nothing to sell → customer undefined → no offer → demand unproven →
 *   no customers → empty pipeline → conversion → retention → capacity →
 *   documentation → acquisition → margin → founder bottleneck → decide → stage focus
 *
 * Unknowns are first-class: when the signals that would sharpen the call are
 * missing, the rule says so (`missingSignals`) and the next action is often
 * "find out", which is the truthful cheapest move.
 */

import { stageBySlug, type StageSlug } from "../stages";
import type { BottleneckData, BottleneckSeverity, CoachAgent, CoachContext } from "../types";
import { resolveStage } from "./stage-resolver";
import {
  COACH_PERSONA,
  JSON_INSTRUCTION,
  asRecord,
  clamp,
  contextDigest,
  optNumber,
  optString,
  reqString,
  stringArray,
} from "./util";

interface Rule {
  slug: string;
  severity: BottleneckSeverity;
  /** Which stage this constraint belongs to. */
  stage: StageSlug;
  when(ctx: CoachContext): boolean;
  build(ctx: CoachContext): Omit<BottleneckData, "missingSignals" | "confidence" | "evidence"> & {
    evidence: string[];
  };
}

const money = (value: number | null): string =>
  value === null ? "unknown" : `$${value.toLocaleString("en-US")}`;

function currentStage(ctx: CoachContext): StageSlug {
  return resolveStage(ctx);
}

/** Signals we would want before trusting a sharper diagnosis. */
function missingSignals(ctx: CoachContext): string[] {
  const f = ctx.facts;
  const missing: string[] = [];
  if (f.customers === null) missing.push("number of paying customers");
  if (f.leadsPerMonth === null) missing.push("leads or conversations started per month");
  if (f.conversionRate === null) missing.push("lead → customer conversion rate");
  if (f.churnRate === null) missing.push("monthly churn rate");
  if (f.capacityUtilization === null) missing.push("how full your delivery capacity is");
  if (f.monthlyRevenue === null) missing.push("current monthly revenue");
  return missing;
}

/** The tempting-but-wrong lever for each constraint — the "do not optimise Y". */
const DISTRACTIONS: Record<string, string> = {
  no_clear_problem: "your brand, logo and domain name",
  undefined_customer: "your marketing channels and ad spend",
  no_offer: "your website design and feature list",
  no_validation: "your product build and polish",
  no_customers: "your funnel automation, ads and SEO",
  empty_pipeline: "your website, branding and pricing page",
  conversion: "your traffic volume and top-of-funnel spend",
  retention: "new customer acquisition and ad budget",
  delivery_capacity: "new marketing channels and lead volume",
  documentation: "hiring and tooling",
  acquisition: "product features and incremental polish",
  margin: "top-line revenue growth",
  founder_bottleneck: "hiring more people",
  no_decision: "next quarter's growth plan",
  stage_focus: "anything outside this stage's milestone",
};

const RULES: Rule[] = [
  {
    slug: "no_clear_problem",
    severity: "critical",
    stage: "find",
    when: (ctx) => !ctx.facts.hasIdea,
    build: () => ({
      slug: "no_clear_problem",
      constraint: "Nothing specific to sell yet",
      why: "There is no concrete problem-and-customer statement on file, so every other decision (offer, price, channel) would be guesswork. This is the constraint; nothing downstream can be optimised until it exists.",
      evidence: ["No business idea or current business described", "No target customer on file"],
      nextAction:
        "Write one sentence in the form \"I help [specific customer] get [specific outcome] without [specific pain]\" — start from a problem you have personally lived or been paid to solve.",
      metricToWatch: {
        name: "Problem statement drafted",
        target: "1 sentence, one customer type, one outcome — today",
        why: "Without it, the next week of work has no direction.",
      },
      severity: "critical",
      doNotOptimize: DISTRACTIONS.no_clear_problem,
      stage: "find",
      improvesWhen: "You can name one customer type and the outcome they would pay for.",
    }),
  },
  {
    slug: "undefined_customer",
    severity: "critical",
    stage: "find",
    when: (ctx) => ctx.facts.hasIdea && !ctx.facts.hasTargetCustomer,
    build: (ctx) => ({
      slug: "undefined_customer",
      constraint: "Your customer is not defined",
      why: `"${ctx.intake.target_customer || "everyone / not sure"}" is not a customer — it is a market. Offers, pricing and channels all key off one specific buyer, so an undefined buyer makes every downstream test unreadable.`,
      evidence: [
        `Target customer answer: ${ctx.intake.target_customer || "not given"}`,
        `Business described: ${ctx.facts.description ?? "unknown"}`,
      ],
      nextAction:
        "Pick ONE narrow segment you can reach this week (role, situation, and the pain they already pay money or hours to fix). Write it down, then book 3 conversations with people in it.",
      metricToWatch: {
        name: "Conversations with the target segment",
        target: "3 booked this week",
        why: "The segment is only real once real people from it talk to you.",
      },
      severity: "critical",
      doNotOptimize: DISTRACTIONS.undefined_customer,
      stage: "find",
      improvesWhen: "You can name the role, the situation and the pain — and strangers in the segment recognise themselves in it.",
    }),
  },
  {
    slug: "no_offer",
    severity: "high",
    stage: "offer",
    when: (ctx) => ctx.facts.hasTargetCustomer && !ctx.facts.hasOffer,
    build: (ctx) => ({
      slug: "no_offer",
      constraint: "No offer — nothing with a price and a promised outcome",
      why: "You know who you serve but there is no packaged outcome with a number attached. Without a price you cannot tell interest from politeness, which is why validation keeps stalling.",
      evidence: [
        `Business: ${ctx.facts.description ?? "unknown"}`,
        "No price, package or delivery promise detected in the founder's answers",
        `Target customer: ${ctx.intake.target_customer ?? "unknown"}`,
      ],
      nextAction:
        "Write the offer in the customer's words: outcome, timeframe, price, and what is explicitly NOT included. Then quote it out loud to 5 people in your segment and count how many ask \"how do I start?\".",
      metricToWatch: {
        name: "People who repeat your offer back correctly",
        target: "3 of 5 without prompting",
        why: "A clear offer survives paraphrasing; a vague one does not.",
      },
      severity: "high",
      doNotOptimize: DISTRACTIONS.no_offer,
      stage: "offer",
      improvesWhen: "You can state the outcome, timeframe and price in one sentence and someone asks to buy.",
    }),
  },
  {
    slug: "no_validation",
    severity: "high",
    stage: "validate",
    when: (ctx) =>
      ctx.facts.hasOffer &&
      !ctx.facts.hasPayingCustomers &&
      ctx.facts.validationEvidence < 2 &&
      currentStage(ctx) === "validate",
    build: (ctx) => ({
      slug: "no_validation",
      constraint: "Demand is unproven",
      why: "You have an idea and a customer, but no paid commitment. Interest is free; only money, a deposit, or a signed pilot proves the problem is worth solving.",
      evidence: [
        `Validation signals found: ${ctx.facts.validationEvidence} (target: 2+)`,
        `Monthly revenue: ${money(ctx.facts.monthlyRevenue)}`,
        `Stage detected: ${currentStage(ctx)}`,
      ],
      nextAction:
        "Ask for money this week: a deposit, a prepay, or a paid pilot at your intended price. Ten \"let me think about it\" answers are a cheaper lesson than ten weeks of building.",
      metricToWatch: {
        name: "Paid commitments",
        target: "1 deposit or prepaid pilot within 14 days",
        why: "Payment is the only validation signal that cannot be faked politely.",
      },
      severity: "high",
      doNotOptimize: DISTRACTIONS.no_validation,
      stage: "validate",
      improvesWhen: "Someone has paid, or 10+ qualified conversations all say no — both are answers.",
    }),
  },
  {
    slug: "no_customers",
    severity: "critical",
    stage: "validate",
    when: (ctx) => !ctx.facts.hasPayingCustomers || ctx.facts.customers === 0,
    build: (ctx) => ({
      slug: "no_customers",
      constraint: "No paying customers",
      why: "A business without a customer is a hypothesis. Everything upstream (offer, price, channel, product) is unfalsifiable until one person pays at full price.",
      evidence: [
        `Monthly revenue: ${money(ctx.facts.monthlyRevenue)}`,
        `Customers known: ${ctx.facts.customers === null ? "unknown" : ctx.facts.customers}`,
        `Founder's own obstacle: ${ctx.facts.selfReportedObstacle ?? "not stated"}`,
      ],
      nextAction:
        "Run a 7-day direct-sales sprint: list 20 named people who match your segment, contact all 20 personally, and ask for the sale. No new assets until someone has paid.",
      metricToWatch: {
        name: "Direct conversations → first payment",
        target: "20 outreach attempts, 1 payment",
        why: "Fixing this constraint is a volume-and-repetition problem before it is a marketing problem.",
      },
      severity: "critical",
      doNotOptimize: DISTRACTIONS.no_customers,
      stage: currentStage(ctx),
      improvesWhen: "One real customer has paid full price and can describe the outcome they bought.",
    }),
  },
  {
    slug: "empty_pipeline",
    severity: "high",
    stage: "sell",
    when: (ctx) =>
      ctx.facts.hasPayingCustomers &&
      (ctx.facts.leadsPerMonth === null || ctx.facts.leadsPerMonth === 0) &&
      stageBySlug(currentStage(ctx)).slug !== "find",
    build: (ctx) => ({
      slug: "empty_pipeline",
      constraint: "Your pipeline is empty — no new conversations are starting",
      why: "You have customers, but nothing upstream feeding the next one. Revenue will look fine this month and stop next month; the constraint is conversation volume, not delivery.",
      evidence: [
        `Paying customers: ${ctx.facts.customers ?? "unknown"}`,
        `Leads / conversations per month: ${ctx.facts.leadsPerMonth === null ? "unknown (none tracked)" : ctx.facts.leadsPerMonth}`,
        `Monthly revenue: ${money(ctx.facts.monthlyRevenue)}`,
      ],
      nextAction:
        "Choose ONE channel you can run weekly and book 5 new conversations from it this week (existing-customer referrals count first). Track conversations started, not impressions.",
      metricToWatch: {
        name: "New qualified conversations / week",
        target: "5 per week, from one named channel",
        why: "A repeatable channel is the difference between sell and scale.",
      },
      severity: "high",
      doNotOptimize: DISTRACTIONS.empty_pipeline,
      stage: "sell",
      improvesWhen: "5+ new conversations start every week without the founder improvising a new channel each time.",
    }),
  },
  {
    slug: "conversion",
    severity: "high",
    stage: "sell",
    when: (ctx) =>
      ctx.facts.hasPayingCustomers &&
      ctx.facts.leadsPerMonth !== null &&
      ctx.facts.leadsPerMonth >= 10 &&
      (ctx.facts.conversionRate === null || ctx.facts.conversionRate < 0.05),
    build: (ctx) => ({
      slug: "conversion",
      constraint: "Leads are arriving but not converting",
      why: "The top of the funnel is working and the sale is not. Pouring in more traffic multiplies the loss; the constraint is what happens between first contact and payment (offer clarity, price, trust, or follow-up).",
      evidence: [
        `Leads / month: ${ctx.facts.leadsPerMonth ?? "unknown"}`,
        `Conversion rate: ${ctx.facts.conversionRate === null ? "unknown" : `${Math.round(ctx.facts.conversionRate * 1000) / 10}%`}`,
        `Paying customers: ${ctx.facts.customers ?? "unknown"}`,
      ],
      nextAction:
        "Read your last 10 lost conversations and write the single most common objection at the top of a page. Fix that one objection in the offer, then re-run 10 conversations with the revised pitch.",
      metricToWatch: {
        name: "Lead → customer conversion rate",
        target: "2× current rate on the next 10 conversations",
        why: "Doubling conversion is almost always cheaper than doubling traffic.",
      },
      severity: "high",
      doNotOptimize: DISTRACTIONS.conversion,
      stage: "sell",
      improvesWhen: "Half of qualified leads advance past first contact, and the same objection stops repeating.",
    }),
  },
  {
    slug: "retention",
    severity: "critical",
    stage: "optimize",
    when: (ctx) => ctx.facts.churnRate !== null && ctx.facts.churnRate > 0.05,
    build: (ctx) => ({
      slug: "retention",
      constraint: "Customers are leaving faster than the promise is being kept",
      why: `Churn of ${Math.round((ctx.facts.churnRate ?? 0) * 1000) / 10}% per month means the business is refilling a leaking bucket: acquisition spend buys a month of revenue, not a customer. Fixing delivery value beats finding more leads.`,
      evidence: [
        `Monthly churn: ${Math.round((ctx.facts.churnRate ?? 0) * 1000) / 10}%`,
        `Paying customers: ${ctx.facts.customers ?? "unknown"}`,
        `Monthly revenue: ${money(ctx.facts.monthlyRevenue)}`,
      ],
      nextAction:
        "Call every customer who left in the last 90 days and ask one question: what did you expect that you did not get? Fix the single most repeated answer before you spend another dollar on acquisition.",
      metricToWatch: {
        name: "Monthly churn rate",
        target: "below 5% (or 3 consecutive months of net-negative churn)",
        why: "Retention compounds; acquisition does not.",
      },
      severity: "critical",
      doNotOptimize: DISTRACTIONS.retention,
      stage: "optimize",
      improvesWhen: "Churn is under 5% a month for two consecutive months.",
    }),
  },
  {
    slug: "delivery_capacity",
    severity: "high",
    stage: "systemize",
    when: (ctx) =>
      (ctx.facts.capacityUtilization !== null && ctx.facts.capacityUtilization >= 0.85) ||
      (ctx.facts.capacityUtilization === null &&
        ctx.facts.hasPayingCustomers &&
        ctx.facts.teamSize === 0 &&
        (ctx.facts.hoursPerWeek ?? 0) >= 45),
    build: (ctx) => ({
      slug: "delivery_capacity",
      constraint: "Delivery capacity is the ceiling",
      why: "Demand outruns the founder's hands. Adding more demand now converts a delivery risk into a reputation risk — the constraint is throughput, not marketing.",
      evidence: [
        `Capacity used: ${
          ctx.facts.capacityUtilization === null
            ? "unknown (estimated from team size and hours)"
            : `${Math.round(ctx.facts.capacityUtilization * 100)}%`
        }`,
        `Team size: ${ctx.facts.teamSize}`,
        `Founder hours / week: ${ctx.facts.hoursPerWeek ?? "unknown"}`,
      ],
      nextAction:
        "Time one delivery end-to-end. Remove or automate the two slowest steps, then raise the price on the next two customers instead of adding a third channel.",
      metricToWatch: {
        name: "Founder hours per delivery",
        target: "cut 30% without lowering the customer outcome",
        why: "Throughput per founder hour is what decides whether this scales.",
      },
      severity: "high",
      doNotOptimize: DISTRACTIONS.delivery_capacity,
      stage: "systemize",
      improvesWhen: "Delivery runs at full demand inside your available hours — and you could hand it to a checklist.",
    }),
  },
  {
    slug: "documentation",
    severity: "medium",
    stage: "systemize",
    when: (ctx) =>
      ctx.facts.hasPayingCustomers &&
      ctx.facts.documentedProcesses === 0 &&
      ["deliver", "systemize", "scale", "optimize"].includes(currentStage(ctx)),
    build: (ctx) => ({
      slug: "documentation",
      constraint: "Every process lives in the founder's head",
      why: "Nothing can be delegated, priced reliably, or scaled while the knowledge is undocumented. This is the ceiling on both margin and time off.",
      evidence: [
        `Documented processes: ${ctx.facts.documentedProcesses}`,
        `Team size: ${ctx.facts.teamSize}`,
        `Stage detected: ${currentStage(ctx)}`,
      ],
      nextAction:
        "Document ONE process — the delivery step that eats the most hours — as a numbered checklist, and run the next delivery from that checklist only. Then do the same for sales follow-up.",
      metricToWatch: {
        name: "Documented core processes",
        target: "3 checklists in 14 days, each used at least once",
        why: "A checklist that exists beats a handbook that doesn't.",
      },
      severity: "medium",
      doNotOptimize: DISTRACTIONS.documentation,
      stage: "systemize",
      improvesWhen: "Someone else (or future-you) can run delivery from the checklist without asking you a question.",
    }),
  },
  {
    slug: "acquisition",
    severity: "high",
    stage: "scale",
    when: (ctx) =>
      ctx.facts.hasPayingCustomers &&
      ["scale", "optimize", "delegate"].includes(currentStage(ctx)) &&
      (ctx.facts.leadsPerMonth === null || ctx.facts.conversionRate === null),
    build: (ctx) => ({
      slug: "acquisition",
      constraint: "No repeatable acquisition channel is proven",
      why: "Demand exists, but it arrives from whatever the founder improvised last week. Scale requires one channel with a known cost per customer — otherwise growth amplifies noise.",
      evidence: [
        `Leads / month: ${ctx.facts.leadsPerMonth === null ? "not tracked" : ctx.facts.leadsPerMonth}`,
        `Conversion rate: ${ctx.facts.conversionRate === null ? "not tracked" : `${Math.round((ctx.facts.conversionRate ?? 0) * 1000) / 10}%`}`,
        `Monthly revenue: ${money(ctx.facts.monthlyRevenue)}`,
      ],
      nextAction:
        "Instrument the channel already producing most of your customers (cost per conversation, per customer, per week), then double it once — before adding any second channel.",
      metricToWatch: {
        name: "New customers per week from one channel + cost per customer",
        target: "predictable weekly number, cost per customer under 1/3 of first-month margin",
        why: "A channel you can forecast is the entry ticket to scale.",
      },
      severity: "high",
      doNotOptimize: DISTRACTIONS.acquisition,
      stage: "scale",
      improvesWhen: "You can state last week's customers-per-channel and the cost to produce them.",
    }),
  },
  {
    slug: "margin",
    severity: "high",
    stage: "optimize",
    when: (ctx) =>
      ctx.facts.hasPayingCustomers &&
      ctx.facts.monthlyRevenue !== null &&
      ctx.facts.monthlyRevenue >= 2000 &&
      ["optimize", "scale", "delegate"].includes(currentStage(ctx)) &&
      ctx.facts.pricePoint === null,
    build: (ctx) => ({
      slug: "margin",
      constraint: "Margins are invisible — you cannot see which customers make money",
      why: "Revenue is growing without unit economics attached. Without cost-per-delivery and price-per-outcome, more volume can quietly reduce profit.",
      evidence: [
        `Monthly revenue: ${money(ctx.facts.monthlyRevenue)}`,
        `Income goal: ${money(ctx.facts.incomeGoal)}`,
        "No unit price or cost-per-delivery on file",
      ],
      nextAction:
        "Price one representative delivery: revenue, direct cost, hours. If contribution margin is under 50% or under your hourly goal, raise price or cut scope before accepting more volume.",
      metricToWatch: {
        name: "Contribution margin per delivery",
        target: "50%+ and above your effective hourly goal",
        why: "Optimising margin on the constraint customer funds everything else.",
      },
      severity: "high",
      doNotOptimize: DISTRACTIONS.margin,
      stage: "optimize",
      improvesWhen: "You can rank your services/customers by margin and act on it.",
    }),
  },
  {
    slug: "founder_bottleneck",
    severity: "medium",
    stage: "delegate",
    when: (ctx) =>
      ctx.facts.hasPayingCustomers &&
      ctx.facts.teamSize === 0 &&
      ["delegate", "exit-or-compound"].includes(currentStage(ctx)),
    build: (ctx) => ({
      slug: "founder_bottleneck",
      constraint: "Every decision still routes through you",
      why: "At this stage the founder is the throughput limit of a documented business: cash is fine, growth and time off are not. Delegation without documentation fails, so the fix is process-then-person.",
      evidence: [
        `Team size: ${ctx.facts.teamSize}`,
        `Documented processes: ${ctx.facts.documentedProcesses}`,
        `Founder hours / week: ${ctx.facts.hoursPerWeek ?? "unknown"}`,
      ],
      nextAction:
        "List every recurring task you did last week, and hand off the one that is fully documented and lowest-risk — contractor or automation — with a written definition of done.",
      metricToWatch: {
        name: "Decisions per week that don't need the founder",
        target: "+1 per month",
        why: "Owner-independence is what makes the business an asset rather than a job.",
      },
      severity: "medium",
      doNotOptimize: DISTRACTIONS.founder_bottleneck,
      stage: "delegate",
      improvesWhen: "A week passes without delivery or sales stalling when you are absent.",
    }),
  },
  {
    slug: "no_decision",
    severity: "medium",
    stage: "exit-or-compound",
    when: (ctx) => currentStage(ctx) === "exit-or-compound",
    build: () => ({
      slug: "no_decision",
      constraint: "No owner-level decision has been made about the asset",
      why: "The business is built enough to be worth something; the open question is what you want from it. Drifting on 'keep going' leaves value unconverted and personal goals unmet.",
      evidence: ["Stage detected: exit-or-compound", "No sell / hold / compound decision recorded"],
      nextAction:
        "Run the Decision Engine on one question with three options: sell now, hold for cash flow, compound. Set a number (valuation or owner cash flow) that would decide it, and a date to revisit.",
      metricToWatch: {
        name: "Valuation range vs. personal goal",
        target: "one documented number + decision date",
        why: "An unpriced asset cannot be compared with any alternative.",
      },
      severity: "medium",
      doNotOptimize: DISTRACTIONS.no_decision,
      stage: "exit-or-compound",
      improvesWhen: "You have written down sell / hold / compound, the number that decides it, and the review date.",
    }),
  },
];

/** Final fallback: the constraint IS this stage's milestone. */
function stageFocus(ctx: CoachContext): BottleneckData {
  const stage = stageBySlug(resolveStage(ctx));
  const evidence = [
    `Stage detected: ${stage.slug}`,
    `Monthly revenue: ${money(ctx.facts.monthlyRevenue)}`,
    `Paying customers: ${ctx.facts.customers === null ? "unknown" : ctx.facts.customers}`,
    `Founder's own obstacle: ${ctx.facts.selfReportedObstacle ?? "not stated"}`,
  ];
  return {
    slug: "stage_focus",
    constraint: `${stage.label} is unfinished: ${stage.milestone}`,
    why: `No downstream constraint is binding yet — the business is standing on ${stage.label}. Skipping the milestone is the most expensive move available, because it forces rework of everything built on top of it.`,
    evidence,
    nextAction: `Work tonight only on the ${stage.label} milestone: ${stage.milestone}.`,
    metricToWatch: {
      name: stage.metric,
      target: `clear movement this week`,
      why: `${stage.label} is decided by this metric, not by effort.`,
    },
    severity: "medium",
    doNotOptimize: stage.trap,
    stage: stage.slug,
    improvesWhen: stage.milestone,
    missingSignals: missingSignals(ctx),
    confidence: 0.55,
  };
}

export function deterministicBottleneck(ctx: CoachContext): BottleneckData {
  for (const rule of RULES) {
    let matched = false;
    try {
      matched = rule.when(ctx);
    } catch {
      matched = false;
    }
    if (!matched) continue;
    const built = rule.build(ctx);
    const missing = missingSignals(ctx);
    // Confidence: how much of the evidence base is actually known.
    const confidence = clamp(0.95 - missing.length * 0.06, 0.5, 0.95);
    return { ...built, missingSignals: missing, confidence };
  }
  return stageFocus(ctx);
}

const SYSTEM = `${COACH_PERSONA}\n\nYou specialise in constraint analysis ("Find the Constraint"). ${JSON_INSTRUCTION}`;

const SCHEMA = `{
  "constraint": "short name of the ONE binding constraint (max 12 words)",
  "slug": "snake_case machine key",
  "why": "2-4 sentences explaining why this is the constraint and why optimising anything else wastes time",
  "evidence": ["3-5 concrete observations from the founder's own data"],
  "nextAction": "one specific action doable within 7 days, with a volume or a number",
  "metricToWatch": { "name": "...", "target": "...", "why": "..." },
  "severity": "critical | high | medium",
  "doNotOptimize": "the tempting-but-wrong lever, phrased as a noun phrase",
  "improvesWhen": "the observable condition that means this constraint is resolved"
}`;

export const bottleneckAgent: CoachAgent<"bottleneck"> = {
  intent: "bottleneck",
  label: "Find the Constraint",
  feature: "bottleneck",
  deterministic: deterministicBottleneck,
  buildPrompt(ctx) {
    const baseline = deterministicBottleneck(ctx);
    return {
      system: SYSTEM,
      user: [
        contextDigest(ctx),
        "",
        "Identify the single binding constraint. A deterministic rule engine reached this provisional verdict — keep it only if it is genuinely the constraint, otherwise correct it:",
        JSON.stringify({ constraint: baseline.constraint, slug: baseline.slug }),
        "",
        "Return JSON exactly matching this shape:",
        SCHEMA,
      ].join("\n"),
    };
  },
  validate(raw, ctx) {
    const record = asRecord(raw);
    const base = deterministicBottleneck(ctx);
    const metricRaw = record.metricToWatch;
    const metricRecord = metricRaw && typeof metricRaw === "object" ? (metricRaw as Record<string, unknown>) : {};
    const severityRaw = optString(record, "severity", base.severity);
    const severity: BottleneckSeverity =
      severityRaw === "critical" || severityRaw === "high" || severityRaw === "medium" ? severityRaw : base.severity;
    return {
      slug: optString(record, "slug", base.slug).slice(0, 60),
      constraint: reqString(record, "constraint"),
      why: reqString(record, "why"),
      evidence: stringArray(record.evidence, 6).length > 0 ? stringArray(record.evidence, 6) : base.evidence,
      nextAction: reqString(record, "nextAction"),
      metricToWatch: {
        name: optString(metricRecord, "name", base.metricToWatch.name),
        target: optString(metricRecord, "target", base.metricToWatch.target),
        why: optString(metricRecord, "why", base.metricToWatch.why ?? ""),
      },
      severity,
      doNotOptimize: optString(record, "doNotOptimize", base.doNotOptimize),
      stage: base.stage,
      improvesWhen: optString(record, "improvesWhen", base.improvesWhen),
      confidence: optNumber(record, "confidence", base.confidence, 0.3, 0.99),
      missingSignals: base.missingSignals,
    };
  },
};

/** Exposed for tests / the lead's verification script. */
export const BOTTLENECK_RULE_SLUGS = RULES.map((rule) => rule.slug);
