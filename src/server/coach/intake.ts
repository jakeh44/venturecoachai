/**
 * Deterministic intake parsing — turns free-text onboarding answers into the
 * machine-usable `BusinessFacts` the coach rule chains rely on.
 *
 * Pure functions (no DB / no fetch) so they can be unit-verified and reused.
 * The guiding rule: parse what the founder actually wrote, never invent a
 * number. Anything unparseable stays `null`, and `null` is a first-class
 * coaching signal ("we don't know this yet").
 */

import type { BusinessFacts, FounderIntake } from "./types";

const NEGATIVE =
  /^(no|none|n\/a|na|nothing|not really|nope|zero|0|pre-?revenue|not yet|无)$/i;
const NOT_SPECIFIC_CUSTOMER =
  /^(everyone|everybody|anyone|anybody|all people|any "?customer"?|not sure|unsure|no one|unknown|tbd)$/i;

/** Phrases that mean "the answer is zero" rather than "unknown". */
const ZERO_LIKE = /^(no|none|zero|nil|n\/a|na|not yet|no revenue|pre-?revenue|nothing)\b/i;

/** Collapse whitespace and strip a trailing period. */
export function tidy(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().replace(/[.;]+$/, "");
}

function isNegative(value: string): boolean {
  return NEGATIVE.test(value.trim());
}

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
};

/**
 * Parse a money-ish answer: "$2,500/mo", "about 10k", "0", "$5k–$8k" (range →
 * midpoint), "twenty dollars" → null (we don't guess words).
 */
export function parseMoney(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = tidy(value);
  if (!text || isNegative(text)) return null;
  const matches = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?/gi)];
  if (matches.length === 0) return null;
  const values = matches.slice(0, 2).map((match) => {
    const base = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) return 0;
    const suffix = match[2]?.toLowerCase();
    return suffix ? base * (MULTIPLIERS[suffix] ?? 1) : base;
  });
  const average = values.reduce((sum, n) => sum + n, 0) / values.length;
  if (!Number.isFinite(average) || average < 0) return null;
  return Math.round(average);
}

/** Parse a count-ish answer ("5 customers", "about 20 leads / month"). */
export function parseCount(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = tidy(value);
  if (!text || isNegative(text)) return null;
  const match = text.match(/(\d[\d,]*)/);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Parse a percentage answer into a 0..1 ratio ("5%" → 0.05, "5" → 0.05). */
export function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = tidy(value);
  if (!text || isNegative(text)) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const ratio = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, ratio));
}

/** Parse hours per week ("20", "20 hrs/week", "two evenings" → null). */
export function parseHours(value: string | null | undefined): number | null {
  const n = parseCount(value);
  if (n === null || n <= 0 || n > 168) return null;
  return n;
}

/** Words that mean "I am paying attention to this problem" (validation signals). */
const VALIDATION_SIGNALS: RegExp[] = [
  /pre-?order|prepay|pre-?pay|deposit/i,
  /pilot|letter of intent|\bloi\b|mou/i,
  /sig(ned|ning)? (up|a contract|the contract)|contract signed/i,
  /paying customer|first (customer|client|sale|sale)|paid me|already (pay|paid)/i,
  /waiting list|waitlist|beta (users|testers)|test users/i,
  /interview(ed|s)?|customer (call|conversation)s?|discovery call/i,
  /(?<!\b(?:not|never|haven'?t|hasn'?t|no|without)\s)(sold|sales|revenue|mrr|arr)\b/i,
];

function countValidationSignals(text: string): number {
  return VALIDATION_SIGNALS.reduce((count, re) => (re.test(text) ? count + 1 : count), 0);
}

/** Words that indicate a defined offer (price + outcome promise). */
const OFFER_SIGNALS = /(\$\d|price|pricing|per month|monthly|per project|package|retainer|subscription|fee|charge|tier|plan\b)/i;

/** Business name from the founder's own words (idea → current business → fallback). */
export function businessNameFromIntake(intake: FounderIntake, fallback = "My business"): string {
  const current = tidy(intake.current_business);
  const idea = tidy(intake.business_idea);
  const source = (!isNegative(current) && current) || idea;
  if (!source) return fallback;
  // Prefer a quoted or capitalised proper name, else the first clause.
  const named = source.match(/(?:called|named|is)\s+["']?([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,3})["']?/);
  if (named?.[1]) return named[1].trim().slice(0, 60);
  const firstClause = source.split(/[.,;:—–\n]/)[0]?.trim() ?? source;
  return (firstClause.length > 4 ? firstClause : source).slice(0, 60);
}

/**
 * Derive facts from onboarding answers. Returns a partial — the caller merges
 * it over `emptyFacts()` and over any explicitly edited metrics.
 */
export function deriveFacts(intake: FounderIntake): Partial<BusinessFacts> {
  const description = [tidy(intake.current_business), tidy(intake.business_idea)]
    .filter((part) => part && !isNegative(part))
    .join(" · ");

  const customer = tidy(intake.target_customer);
  const hasTargetCustomer = Boolean(customer) && !isNegative(customer) && !NOT_SPECIFIC_CUSTOMER.test(customer);

  const revenueText = tidy(intake.current_revenue);
  // "no revenue yet" is a KNOWN fact (zero), not an unknown — it drives the
  // rule chain differently from "we have no idea what we earn".
  const monthlyRevenue = ZERO_LIKE.test(revenueText) ? 0 : parseMoney(revenueText);

  const offerText = `${tidy(intake.business_idea)} ${tidy(intake.current_business)} ${tidy(intake.business_model)}`;
  const hasOffer = hasTargetCustomer && OFFER_SIGNALS.test(offerText);

  const evidenceText = `${tidy(intake.current_business)} ${tidy(intake.business_idea)} ${tidy(intake.biggest_obstacle)} ${revenueText}`;
  const validationEvidence = countValidationSignals(evidenceText);
  const hasPayingCustomers = (monthlyRevenue !== null && monthlyRevenue > 0) || /paying customer/i.test(evidenceText);

  return {
    name: businessNameFromIntake(intake, ""),
    description: description || null,
    monthlyRevenue,
    hoursPerWeek: parseHours(intake.hours_per_week),
    incomeGoal: parseMoney(intake.income_goal),
    startupCapital: parseMoney(intake.startup_capital),
    hasIdea: Boolean(description),
    hasTargetCustomer,
    hasOffer,
    hasPayingCustomers,
    validationEvidence,
    selfReportedObstacle: tidy(intake.biggest_obstacle) || null,
  };
}

/** Free-text blob of everything the founder told us — used for keyword scoring. */
export function intakeBlob(intake: FounderIntake, facts?: BusinessFacts): string {
  const answers = Object.values(intake).map(tidy).filter(Boolean);
  if (facts) {
    answers.push(facts.name ?? "", facts.description ?? "", facts.selfReportedObstacle ?? "");
  }
  return answers.join(" \n ").toLowerCase();
}
