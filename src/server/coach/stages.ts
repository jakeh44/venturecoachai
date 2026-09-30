/**
 * The ten-stage Business Builder roadmap.
 *
 * Slugs, labels and focus descriptions are the EXACT values from
 * /home/team/shared/PRODUCT-CONSTANTS.md §1 (and mirror the DB check
 * constraint on coaching_state.current_stage). Sequential: the coach detects
 * the user's current stage and refuses to let them jump ahead.
 *
 * Pure data — safe to import from client components (roadmap stepper,
 * dashboard stage strip).
 */

export const STAGE_SLUGS = [
  "find",
  "validate",
  "offer",
  "sell",
  "deliver",
  "systemize",
  "scale",
  "optimize",
  "delegate",
  "exit-or-compound",
] as const;

export type StageSlug = (typeof STAGE_SLUGS)[number];

export interface Stage {
  slug: StageSlug;
  label: string;
  focus: string;
  /** What "done" looks like for this stage — the milestone the coach tests for. */
  milestone: string;
  /** The one metric that matters most while standing on this stage. */
  metric: string;
  /** Stage-typical trap that eats founder time. */
  trap: string;
}

export const STAGES: readonly Stage[] = [
  {
    slug: "find",
    label: "Find",
    focus: "Identify a valuable problem and target customer",
    milestone: "A specific problem, tied to a specific customer who already spends money or time on it",
    metric: "problem interviews completed",
    trap: "polishing a logo or brand before you know whose problem you solve",
  },
  {
    slug: "validate",
    label: "Validate",
    focus: "Determine whether people actually care enough to pay",
    milestone: "Real evidence of demand: pre-orders, LOIs, pilots, or a paid deposit",
    metric: "paid commitments (deposits, prepayments, signed pilots)",
    trap: "counting compliments, survey answers and 'that's a great idea' as validation",
  },
  {
    slug: "offer",
    label: "Offer",
    focus: "Create a compelling offer based on the customer's desired outcome",
    milestone: "A one-sentence offer with a price, an outcome and a time-to-value your customer repeats back correctly",
    metric: "people who can repeat your offer back unprompted",
    trap: "adding features instead of sharpening the promise and the price",
  },
  {
    slug: "sell",
    label: "Sell",
    focus: "Acquire the first customers manually",
    milestone: "Your first paying customers, acquired by hand with no automation",
    metric: "paying customers (target: first 3–5)",
    trap: "automating funnels before you have manually closed anyone",
  },
  {
    slug: "deliver",
    label: "Deliver",
    focus: "Create a repeatable customer-delivery process",
    milestone: "Delivery that produces the promised outcome repeatably, with a checklist you could hand to someone else",
    metric: "on-time, on-outcome deliveries (and customer-reported outcome)",
    trap: "heroic one-off delivery that only works because the founder is awake",
  },
  {
    slug: "systemize",
    label: "Systemize",
    focus: "Document processes and eliminate unnecessary founder involvement",
    milestone: "Every core process written down and run from a checklist, not from memory",
    metric: "documented core processes / founder hours per delivery",
    trap: "documenting everything instead of the three processes that actually bind",
  },
  {
    slug: "scale",
    label: "Scale",
    focus: "Increase customer acquisition and operational capacity",
    milestone: "One acquisition channel that reliably produces customers, plus capacity to serve them",
    metric: "new customers per week from a repeatable channel",
    trap: "spreading across five channels and mastering none",
  },
  {
    slug: "optimize",
    label: "Optimize",
    focus: "Improve margins, retention, conversion, and customer LTV",
    milestone: "Improving unit economics: margin, churn and LTV are measured and moving the right way",
    metric: "contribution margin and net revenue retention",
    trap: "chasing revenue growth that hides negative unit economics",
  },
  {
    slug: "delegate",
    label: "Delegate",
    focus: "Build people, processes, and technology around the business",
    milestone: "The business runs without the founder in every decision — people and systems own outcomes",
    metric: "decisions per week that don't require the founder",
    trap: "hiring to fix a process problem, then drowning in management",
  },
  {
    slug: "exit-or-compound",
    label: "Exit or Compound",
    focus: "Decide whether to sell, maintain, or continue expanding",
    milestone: "A deliberate decision — sell, hold for cash flow, or compound — backed by valuation and personal goals",
    metric: "business value / owner cash flow vs. personal goal",
    trap: "defaulting into 'keep going' without ever pricing the asset",
  },
];

const STAGE_BY_SLUG: Record<string, Stage> = Object.fromEntries(
  STAGES.map((stage) => [stage.slug, stage]),
);

export function isStageSlug(value: unknown): value is StageSlug {
  return typeof value === "string" && value in STAGE_BY_SLUG;
}

export function stageBySlug(slug: string | null | undefined): Stage {
  return (slug && STAGE_BY_SLUG[slug]) || STAGES[0];
}

export function stageIndex(slug: string | null | undefined): number {
  const index = STAGE_SLUGS.indexOf(stageBySlug(slug).slug);
  return index < 0 ? 0 : index;
}

/** Next stage in the sequence, or null at the end of the roadmap. */
export function nextStage(slug: string | null | undefined): Stage | null {
  const index = stageIndex(slug);
  return STAGES[index + 1] ?? null;
}
