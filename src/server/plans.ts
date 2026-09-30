/**
 * Plan configuration — the single source of truth for pricing and usage
 * limits. Mirrors PRODUCT-CONSTANTS.md ("Plan config" section) exactly.
 *
 * Prices live HERE in code; subscriptions snapshot `price_cents` at assignment
 * so historical rows stay truthful when prices change. Changing a limit or
 * price = this code edit, no migration.
 *
 * NOTE (flag for lead): PRODUCT-CONSTANTS.md says Pro = "1 business", but the
 * task brief specifies businessLimit 3 for Pro (and the plan doc's "unlimited
 * coaching" framing). Code follows the task brief; constants file is the
 * marketing/plan doc and should be reconciled by the lead.
 */

export const FEATURES = [
  "idea_analysis",
  "decision_guidance",
  "bottleneck",
  "daily_priorities",
  "weekly_plan",
] as const;

export type Feature = (typeof FEATURES)[number];

export type LimitWindow = "day" | "month";

export interface UsageLimit {
  /** Max uses per window. Infinity = unlimited (never enforced). */
  max: number;
  window: LimitWindow;
}

export type PlanId = "free" | "pro" | "elite";

export interface Plan {
  id: PlanId;
  label: string;
  priceCents: number;
  /** Max businesses allowed on this plan. Infinity = unlimited. */
  businessLimit: number;
  /** Usage caps per feature. Elite caps are all Infinity. */
  limits: Record<Feature, UsageLimit>;
  /** Human-readable feature bullets for display (pricing/plan badge). */
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    priceCents: 0,
    businessLimit: 1,
    limits: {
      idea_analysis: { max: 5, window: "month" },
      decision_guidance: { max: 3, window: "month" },
      bottleneck: { max: 10, window: "month" },
      daily_priorities: { max: 1, window: "day" },
      weekly_plan: { max: 4, window: "month" },
    },
    features: [
      "1 business",
      "5 idea analyses / month",
      "3 decision guidance runs / month",
      "10 bottleneck analyses / month",
      "1 daily priority session / day",
      "4 weekly plans / month",
    ],
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceCents: 2900,
    businessLimit: 3,
    limits: {
      // Generous caps per PRODUCT-CONSTANTS.md ("caps = 1000/month, 100/day
      // where tracked") — effectively unlimited for a solo founder.
      idea_analysis: { max: 1000, window: "month" },
      decision_guidance: { max: 1000, window: "month" },
      bottleneck: { max: 1000, window: "month" },
      daily_priorities: { max: 100, window: "day" },
      weekly_plan: { max: 1000, window: "month" },
    },
    features: [
      "3 businesses",
      "Up to 1,000 coaching actions / month",
      "Daily priorities with no practical cap",
      "Everything in Free",
    ],
  },
  elite: {
    id: "elite",
    label: "Elite",
    priceCents: 9900,
    businessLimit: Infinity,
    limits: {
      idea_analysis: { max: Infinity, window: "month" },
      decision_guidance: { max: Infinity, window: "month" },
      bottleneck: { max: Infinity, window: "month" },
      daily_priorities: { max: Infinity, window: "day" },
      weekly_plan: { max: Infinity, window: "month" },
    },
    features: [
      "Unlimited businesses",
      "Unlimited coaching — everything unlimited",
      "Advanced analysis & financials",
      "Weekly strategic review",
      "Priority coaching",
      "Analytics",
    ],
  },
};

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free",
  pro: "Pro",
  elite: "Elite",
};

/** Display order for upsell/pricing UI. */
export const PLAN_ORDER: PlanId[] = ["free", "pro", "elite"];

export function isPlanId(value: string): value is PlanId {
  return value === "free" || value === "pro" || value === "elite";
}

/** Unknown/corrupt plan rows fall back to Free (conservative enforcement). */
export function planById(value: string | null | undefined): Plan {
  return PLANS[value as PlanId] ?? PLANS.free;
}