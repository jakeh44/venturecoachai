/**
 * idea-analysis.ts — the Business Idea Analyzer.
 *
 * Scores an idea 1–10 across 15 categories (all oriented so 10 = better for
 * the founder), computes the weighted Business Opportunity Score, splits what
 * we KNOWN vs ASSUME vs DON'T KNOW, and finishes with a cheap Validation Plan
 * aimed at the weakest assumptions.
 *
 * Scoring is lexicon + fact driven: the founder's own words and numbers move
 * each score, and the `reason` always cites what moved it. No black box.
 */

import { resolveStageInfo } from "./stage-resolver";
import { intakeBlob } from "../intake";
import type { CoachAgent, CoachContext, IdeaAnalysisData, IdeaCategoryScore, ValidationStep } from "../types";
import { buildValidationPlan, deriveAssumptions } from "./validation-plan";
import {
  COACH_PERSONA,
  JSON_INSTRUCTION,
  asRecord,
  clamp,
  contextDigest,
  optNumber,
  optString,
  round,
  stringArray,
} from "./util";

interface Signal {
  re: RegExp;
  delta: number;
  label: string;
}

interface Category {
  key: string;
  label: string;
  weight: number;
  /** Base score before signals (all pre-oriented so 10 = best). */
  base: number;
  /** One line explaining what a 10 means for this category. */
  direction: string;
  signals: Signal[];
  /** Extra adjustment from structured facts. */
  fact?: (ctx: CoachContext) => { delta: number; label: string } | null;
}

const s = (re: RegExp, delta: number, label: string): Signal => ({ re, delta, label });

const CATEGORIES: Category[] = [
  {
    key: "problem_severity",
    label: "Problem severity",
    weight: 0.11,
    base: 5,
    direction: "10 = urgent, expensive, or compliance-driven pain",
    signals: [
      s(/compliance|regulation|legal|audit|fine|penalt|mandatory|required by law/, 2, "regulatory or compliance pain"),
      s(/losing (money|clients|customers)|revenue loss|chargeback|fraud|downtime|outage/, 2, "pain is measured in lost money"),
      s(/wast(e|ing) (hours|time)|manual(ly)?|spreadsheet|hours a (day|week)|tedious|admin/, 1.5, "pain is measured in wasted hours"),
      s(/b2b|business(es)?|companies|agenc(y|ies)|clinics|contractors/, 1, "business buyers with budget and deadlines"),
      s(/nice to have|hobby|fun|interesting|lifestyle|curious/, -2, "framed as nice-to-have, not must-have"),
      s(/deadline|urgent|asap|emergency|same[- ]day/, 1.5, "time-critical trigger"),
    ],
  },
  {
    key: "willingness_to_pay",
    label: "Willingness to pay",
    weight: 0.11,
    base: 5,
    direction: "10 = buyers already spend money on this today",
    signals: [
      s(/already (pay|pays|spend|spends)|budget|pays? for|existing spend|invoice/, 2.5, "buyers already have budget"),
      s(/subscription|monthly|retainer|per seat|membership/, 1.5, "recurring payment habit in the category"),
      s(/\$\d{3,}|per hour|consult(ing|ant)|professional (service|fee)/, 1, "professional pricing already accepted"),
      s(/free|freemium|ad-?supported|pay what you want|donation/, -2, "free expectations in the category"),
      s(/consumer|individual|students?|shoppers?/, -1, "consumer wallets are smaller and slower to convert"),
    ],
    fact: (ctx) => {
      const f = ctx.facts;
      if (f.hasPayingCustomers && (f.monthlyRevenue ?? 0) > 0) {
        return { delta: 2, label: "already paying customers exist — payment is proven" };
      }
      if (f.monthlyRevenue === 0) return { delta: -1, label: "no revenue yet — price acceptance untested" };
      return null;
    },
  },
  {
    key: "market",
    label: "Market size & timing",
    weight: 0.06,
    base: 5,
    direction: "10 = large, reachable, growing market",
    signals: [
      s(/every(one|body)|all (businesses|companies|people)|global|worldwide/, 1.5, "very broad addressable market"),
      s(/growing|emerging|new|booming|ai|remote work|shift to/, 1.5, "tailwind or category growth"),
      s(/shrinking|declining|dying|commodit(y|ies)|race to the bottom/, -2, "declining or commoditised market"),
      s(/local|my (city|town|area|neighbou?rhood)|one (town|city)/, -1, "market limited to one geography"),
      s(/niche|specific|only for|specialis|specializ/, 0.5, "niche focus (small but reachable)"),
    ],
  },
  {
    key: "competition",
    label: "Competitive position",
    weight: 0.04,
    base: 5,
    direction: "10 = some proven demand, no dominant incumbent, you can differentiate",
    signals: [
      s(/competitor|alternative|similar|incumbent|market leader|existing (tool|service)/, 1.5, "demand already proven by competitors"),
      s(/no competitors|nobody does this|first of its kind|no one (else )?(does|is doing)/, -1.5, "no competition can mean no market (or nobody cared)"),
      s(/google|amazon|shopify|hubspot|excel|word|notion|spreadsheet/, 1, "real substitute is identifiable"),
    ],
  },
  {
    key: "differentiation",
    label: "Differentiation",
    weight: 0.08,
    base: 5,
    direction: "10 = a defensible reason to choose you",
    signals: [
      s(/proprietary|patent|exclusive|unique (method|process|data)|first-?hand|10 years|20 years/, 2.5, "proprietary method or deep experience"),
      s(/ai|automation|algorithm|model|platform|data\b/, 1, "technology-based edge"),
      s(/network|community|relationship|referral|reputation/, 1, "relationship or network advantage"),
      s(/niche|specialis|specializ|only for|tailored to/, 1, "narrow specialisation"),
      s(/same as|just like|similar to|clone|cheaper version|like uber for/, -2, "no stated reason to choose you"),
    ],
  },
  {
    key: "acquisition_difficulty",
    label: "Ease of acquisition",
    weight: 0.09,
    base: 5,
    direction: "10 = a narrow, cheap, repeatable channel you can already reach",
    signals: [
      s(/linkedin|seo|search|local (search|facebook group)|community|forum|newsletter|podcast|referral/, 2, "identified direct channel"),
      s(/b2b|business(es)?|companies/, 1, "B2B lists are targetable (B2B buyers are findable)"),
      s(/viral|social media|tiktok|instagram|influencer|ads?\b/, -1, "paid or viral acquisition (expensive and unreliable early)"),
      s(/everyone|general public|mass market/, -1.5, "no narrow entry point"),
      s(/warm network|existing (network|clients|customers)|contacts/, 1.5, "warm audience to start from"),
    ],
    fact: (ctx) =>
      ctx.facts.leadsPerMonth !== null && ctx.facts.leadsPerMonth > 0
        ? { delta: 1, label: "conversations already being generated" }
        : null,
  },
  {
    key: "startup_cost",
    label: "Low startup cost",
    weight: 0.05,
    base: 6,
    direction: "10 = no capital needed (10 = cheap, not expensive)",
    signals: [
      s(/inventory|manufactur|hardware|warehouse|storefront|kitchen|vehicle|machine|equipment/, -3, "physical inventory or equipment costs"),
      s(/licen[cs]e|certification|insurance|bond|permit/, -1.5, "licensing or insurance required"),
      s(/software|digital|service|consulting|coaching|content|saas/, 2, "software or service: near-zero capital"),
      s(/dropship|marketplace|platform|no inventory/, 1.5, "no inventory needed"),
    ],
    fact: (ctx) => {
      const capital = ctx.facts.startupCapital;
      if (capital === null) return null;
      if (capital >= 20000) return { delta: 1, label: `$${capital.toLocaleString("en-US")} available covers the setup` };
      if (capital <= 1000) return { delta: -1.5, label: `only $${capital.toLocaleString("en-US")} available — capital-light path required` };
      return null;
    },
  },
  {
    key: "operational_complexity",
    label: "Operational simplicity",
    weight: 0.04,
    base: 6,
    direction: "10 = one person can run it (10 = simple, not complex)",
    signals: [
      s(/24\/7|round the clock|on-?call|emergency|same[- ]day delivery/, -2, "always-on or emergency SLA"),
      s(/staff|employees|team|hire|logistics|supply chain|multiple locations/, -2, "staffing or logistics heavy"),
      s(/solo|one person|myself|no (staff|employees)/, 2, "runnable by one person"),
      s(/template|automated|automatic|self-?serve|software/, 1.5, "automatable core"),
    ],
  },
  {
    key: "scalability",
    label: "Scalability",
    weight: 0.08,
    base: 5,
    direction: "10 = revenue grows without linear founder hours",
    signals: [
      s(/software|saas|digital|course|content|template|api|licens/, 2.5, "marginal cost near zero"),
      s(/subscription|membership|recurring|platform/, 1.5, "compounding revenue base"),
      s(/consulting|1[- ]?(on|to)[- ]?1|done for you|agency|freelanc|per (client|project|hour)/, -2, "revenue tied to founder hours"),
      s(/franchise|licens(e|ing) model|reseller/, 1, "leverage through others"),
    ],
  },
  {
    key: "recurring_revenue",
    label: "Recurring revenue",
    weight: 0.08,
    base: 5,
    direction: "10 = customers pay every month by design",
    signals: [
      s(/subscription|monthly|mrr|retainer|recurring|membership|per (month|seat)|annual plan/, 3, "recurring revenue built into the model"),
      s(/maintenance|support plan|managed service|hosting/, 1.5, "ongoing service need"),
      s(/one[- ]?off|project[- ]based|per job|single purchase|course|ebook|consultation/, -2, "transactional, not recurring"),
    ],
  },
  {
    key: "margin",
    label: "Gross margin",
    weight: 0.08,
    base: 5,
    direction: "10 = high margin per delivery",
    signals: [
      s(/software|digital|saas|coaching|consulting|template|content|licens/, 2.5, "high-margin delivery"),
      s(/retail|resell|dropship|wholesale|physical|hardware|product/, -1.5, "cost of goods compresses margin"),
      s(/labour|hourly|manual (work|labour)|piecework/, -1.5, "revenue priced against hours"),
      s(/premium|high-?ticket|enterprise|b2b/, 1, "premium price point available"),
    ],
    fact: (ctx) => {
      const revenue = ctx.facts.monthlyRevenue ?? 0;
      const goal = ctx.facts.incomeGoal ?? null;
      if (goal && revenue > 0) {
        const ratio = revenue / goal;
        if (ratio >= 1) return { delta: 1, label: "already at/above the stated income goal" };
        if (ratio < 0.2) return { delta: -1, label: "revenue is far below the stated income goal" };
      }
      return null;
    },
  },
  {
    key: "founder_market_fit",
    label: "Founder–market fit",
    weight: 0.07,
    base: 5,
    direction: "10 = you have unfair insight, skill or access in this market",
    signals: [
      s(/i (have|built|ran|worked|spent|led|managed)|years of|my (career|experience|current job)/, 2, "direct personal experience"),
      s(/expert|specialist|certified|trained|engineer|developer|accountant|nurse|teacher|lawyer/, 1.5, "professional skill match"),
      s(/network|community|clients already|i know|insider|contacts/, 1.5, "access or distribution advantage"),
      s(/no experience|never (worked|done)|curious|interested in/, -2, "no experience in this domain yet"),
    ],
    fact: (ctx) => {
      const experience = ctx.intake.experience?.toLowerCase() ?? "";
      if (/10\+|experienced|veteran|decade/.test(experience)) return { delta: 1.5, label: "long business track record" };
      if (/none|no experience|first business|beginner|never/.test(experience)) {
        return { delta: -1, label: "first business — learning curve is real" };
      }
      return null;
    },
  },
  {
    key: "speed_to_revenue",
    label: "Speed to first revenue",
    weight: 0.05,
    base: 5,
    direction: "10 = cash within weeks",
    signals: [
      s(/consulting|coaching|service|freelanc|done for you|agency|audit|clean(ing)|repair/, 3, "services can be sold this week"),
      s(/saas|app|platform|software|marketplace|hardware|device/, -2, "build-first models delay revenue"),
      s(/pre-?order|prepay|deposit|pilot|paid (trial|beta)/, 2, "customers can pay before you build"),
      s(/marketplace|two-?sided|network effects/, -1, "cold-start problem delays revenue"),
    ],
  },
  {
    key: "automation",
    label: "Automation potential",
    weight: 0.04,
    base: 5,
    direction: "10 = the core work can run without you",
    signals: [
      s(/software|api|automat|self-?serve|template|ai|workflow/, 2.5, "automatable core"),
      s(/report|document|checklist|schedul|invoic|reminder/, 1, "repeatable, rule-based tasks"),
      s(/relationship|negotiat|bespoke|custom (work|build)|judgement|judgment|creative direction/, -1.5, "judgement-heavy work resists automation"),
    ],
  },
  {
    key: "exit",
    label: "Exit potential",
    weight: 0.02,
    base: 5,
    direction: "10 = an acquirable asset someone else would buy",
    signals: [
      s(/saas|subscription|recurring|mrr|arr|data|platform|customer base/, 2.5, "recurring revenue and data are acquirable"),
      s(/b2b|enterprise|contracts|long-?term agreement/, 1.5, "contractual revenue attracts buyers"),
      s(/personal brand|my (name|face)|relationships only|consulting only/, -2, "value is tied to the founder, not the business"),
      s(/local|single location|franchise/, 0.5, "operating businesses still trade"),
    ],
  },
];

function scoreCategory(category: Category, ctx: CoachContext, blob: string): IdeaCategoryScore {
  let score = category.base;
  const hits: string[] = [];
  for (const signal of category.signals) {
    if (signal.re.test(blob)) {
      score += signal.delta;
      hits.push(signal.label);
    }
  }
  const factResult = category.fact?.(ctx) ?? null;
  if (factResult) {
    score += factResult.delta;
    hits.push(factResult.label);
  }
  const clamped = clamp(Math.round(score), 1, 10);
  const reason =
    hits.length > 0
      ? `${hits.slice(0, 2).join("; ")}.`
      : `No strong signals either way — ${category.direction}.`;
  return { key: category.key, label: category.label, score: clamped, weight: category.weight, reason };
}

function grade(overall: number): string {
  if (overall >= 80) return "Strong";
  if (overall >= 68) return "Promising";
  if (overall >= 55) return "Conditional";
  if (overall >= 42) return "Weak";
  return "Rethink";
}

const QUESTION_LABELS: Record<string, string> = {
  occupation: "Current occupation",
  experience: "Business experience",
  current_business: "Current business",
  target_customer: "Target customer",
  current_revenue: "Current revenue",
  income_goal: "Monthly income goal",
  startup_capital: "Startup capital",
  hours_per_week: "Hours available per week",
  timeline: "Timeline",
  skills: "Skills",
  network_resources: "Network and resources",
  risk_tolerance: "Risk tolerance",
  business_model: "Preferred business model",
  ambition: "Ambition",
};

export function deterministicIdeaAnalysis(ctx: CoachContext): IdeaAnalysisData {
  const blob = intakeBlob(ctx.intake, ctx.facts);
  const categories = CATEGORIES.map((category) => scoreCategory(category, ctx, blob));
  const weighted = categories.reduce((sum, category) => sum + category.score * category.weight, 0);
  const overallScore = Math.round(clamp(weighted, 1, 10) * 10);

  const strengths = categories
    .filter((category) => category.score >= 7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((category) => `${category.label} (${category.score}/10): ${category.reason}`);
  const risks = categories
    .filter((category) => category.score <= 4)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((category) => `${category.label} (${category.score}/10): ${category.reason}`);

  const known = Object.entries(ctx.intake)
    .filter(([key, value]) => QUESTION_LABELS[key] && typeof value === "string" && value.trim().length > 0)
    .slice(0, 8)
    .map(([key, value]) => `${QUESTION_LABELS[key]}: ${value.trim().slice(0, 140)}`);

  const assumptions = deriveAssumptions(ctx);
  const assumed = assumptions
    .filter((assumption) => assumption.risk !== "low")
    .map((assumption) => assumption.assumption);
  const unknown = [
    "Size and growth rate of the addressable market (not researched)",
    "Cost to acquire one customer through a named channel",
    "Gross margin per delivery",
    "Repeat purchase / churn behaviour",
    "Regulatory, licensing or insurance requirements",
    "Who your first ten customers actually are, by name",
  ];

  const plan = buildValidationPlan(ctx, assumptions, 4);
  const validationPlan: ValidationStep[] = plan.steps;

  const stage = resolveStageInfo(ctx);
  const weakest = [...categories].sort((a, b) => a.score - b.score)[0];
  const strongest = [...categories].sort((a, b) => b.score - a.score)[0];

  return {
    overallScore,
    grade: grade(overallScore),
    verdict:
      overallScore >= 68
        ? "Worth real validation money and time — test demand before building."
        : overallScore >= 55
          ? "Conditional: promising shape, but the weak categories must be answered before you invest."
          : "High risk as stated. Re-aim the segment or the offer before spending time or money.",
    summary: [
      `Business Opportunity Score ${overallScore}/100 (${grade(overallScore)}), measured against ${categories.length} categories.`,
      strongest ? `Strongest: ${strongest.label} (${strongest.score}/10).` : "",
      weakest ? `Weakest: ${weakest.label} (${weakest.score}/10).` : "",
      `You are standing at ${stage.label}; the plan below targets the assumptions that would sink the idea first.`,
    ]
      .filter(Boolean)
      .join(" "),
    categories,
    strengths,
    risks,
    knownAssumedUnknown: { known, assumed, unknown },
    validationPlan,
  };
}

const SYSTEM = `${COACH_PERSONA}\n\nYou are running a rigorous, sceptical business-idea analysis with a 1-10 score per category (10 = best), an overall score out of 100, and a cheap validation plan. ${JSON_INSTRUCTION}`;

function overallFrom(categories: IdeaCategoryScore[]): number {
  const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0) || 1;
  const weighted = categories.reduce((sum, category) => sum + category.score * category.weight, 0);
  return Math.round(clamp(weighted / totalWeight, 1, 10) * 10);
}

export const ideaAnalysisAgent: CoachAgent<"idea_analysis"> = {
  intent: "idea_analysis",
  label: "Business Idea Analyzer",
  feature: "idea_analysis",
  deterministic: deterministicIdeaAnalysis,
  buildPrompt(ctx) {
    const base = deterministicIdeaAnalysis(ctx);
    return {
      system: SYSTEM,
      user: [
        contextDigest(ctx),
        "",
        "Category definitions (score 1-10, 10 always = best for the founder, weights fixed):",
        JSON.stringify(
          CATEGORIES.map((category) => ({
            key: category.key,
            label: category.label,
            weight: category.weight,
            ten_means: category.direction,
          })),
        ),
        "",
        "Deterministic baseline scores to review and correct where the evidence disagrees:",
        JSON.stringify(base.categories.map((category) => ({ key: category.key, score: category.score, reason: category.reason }))),
        "",
        "Return JSON: {\"categories\":[{\"key\":\"...\",\"score\":1-10,\"reason\":\"cites the founder's own facts\"}],\"strengths\":[\"...\"],\"risks\":[\"...\"],\"known\":[\"...\"],\"assumed\":[\"...\"],\"unknown\":[\"...\"],\"summary\":\"2-3 sentences\",\"verdict\":\"1 sentence\"}",
      ].join("\n"),
    };
  },
  validate(raw, ctx) {
    const record = asRecord(raw);
    const base = deterministicIdeaAnalysis(ctx);
    const rows = Array.isArray(record.categories) ? record.categories : [];
    if (rows.length === 0) throw new Error("llm_no_categories");
    const byKey = new Map<string, { score: number; reason: string }>();
    for (const row of rows) {
      const item = asRecord(row);
      const key = optString(item, "key", "");
      if (!key) continue;
      byKey.set(key, { score: optNumber(item, "score", 5, 1, 10), reason: optString(item, "reason", "") });
    }
    const categories = base.categories.map((category) => {
      const override = byKey.get(category.key);
      if (!override) return category;
      return {
        ...category,
        score: Math.round(override.score),
        reason: override.reason || category.reason,
      };
    });
    const overallScore = overallFrom(categories);
    const strengthList = stringArray(record.strengths, 5);
    const riskList = stringArray(record.risks, 5);
    return {
      ...base,
      overallScore,
      grade: grade(overallScore),
      categories,
      strengths: strengthList.length > 0 ? strengthList : base.strengths,
      risks: riskList.length > 0 ? riskList : base.risks,
      knownAssumedUnknown: {
        known: stringArray(record.known, 10).length > 0 ? stringArray(record.known, 10) : base.knownAssumedUnknown.known,
        assumed:
          stringArray(record.assumed, 10).length > 0 ? stringArray(record.assumed, 10) : base.knownAssumedUnknown.assumed,
        unknown:
          stringArray(record.unknown, 10).length > 0 ? stringArray(record.unknown, 10) : base.knownAssumedUnknown.unknown,
      },
      summary: optString(record, "summary", base.summary),
      verdict: optString(record, "verdict", base.verdict),
    };
  },
};

/** Exposed for tests / tooling. */
export const IDEA_CATEGORY_KEYS = CATEGORIES.map((category) => category.key);
export const IDEA_WEIGHT_TOTAL = round(CATEGORIES.reduce((sum, c) => sum + c.weight, 0), 4);
