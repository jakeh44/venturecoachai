/**
 * health.ts — the Business Health Scorecard.
 *
 * A deterministic 1–100 score across the seven things that actually decide an
 * early business: traction, customers, validation, pipeline, retention,
 * systems and clarity. Each component reports its own score and a note in the
 * founder's own numbers, so the scorecard is auditable rather than a vibe.
 *
 * Pure — no DB, no LLM.
 */

import { clamp } from "./agents/util";
import { resolveStage } from "./agents/stage-resolver";
import type { CoachContext } from "./types";

export interface HealthComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  note: string;
}

export interface HealthScore {
  score: number;
  band: "critical" | "fragile" | "stable" | "strong";
  components: HealthComponent[];
  headline: string;
  weakest: string;
  strongest: string;
}

const money = (value: number): string => `$${Math.round(value).toLocaleString("en-US")}`;

/** Customers expected by the time a stage is complete. */
const CUSTOMER_TARGET: Record<string, number> = {
  find: 1,
  validate: 1,
  offer: 1,
  sell: 3,
  deliver: 5,
  systemize: 10,
  scale: 25,
  optimize: 50,
  delegate: 75,
  "exit-or-compound": 100,
};

export function computeHealthScore(ctx: CoachContext): HealthScore {
  const f = ctx.facts;
  const stage = resolveStage(ctx);

  /* --- traction: revenue against the founder's own income goal ---------- */
  let traction: HealthComponent;
  if (f.monthlyRevenue === null) {
    traction = {
      key: "traction",
      label: "Traction",
      score: 20,
      weight: 0.2,
      note: "Revenue is not on file — the coach cannot see whether the model works.",
    };
  } else if (f.incomeGoal && f.incomeGoal > 0) {
    const ratio = f.monthlyRevenue / f.incomeGoal;
    traction = {
      key: "traction",
      label: "Traction",
      score: Math.round(clamp(ratio * 100, 0, 100)),
      weight: 0.2,
      note: `${money(f.monthlyRevenue)}/month against a ${money(f.incomeGoal)} goal (${Math.round(ratio * 100)}%).`,
    };
  } else {
    const score = f.monthlyRevenue <= 0 ? 0 : f.monthlyRevenue < 500 ? 25 : f.monthlyRevenue < 2000 ? 50 : f.monthlyRevenue < 5000 ? 70 : 85;
    traction = {
      key: "traction",
      label: "Traction",
      score,
      weight: 0.2,
      note: `${money(f.monthlyRevenue)}/month (no income goal recorded for comparison).`,
    };
  }

  /* --- customers -------------------------------------------------------- */
  const target = CUSTOMER_TARGET[stage] ?? 5;
  const customers = f.customers;
  const customersComponent: HealthComponent = {
    key: "customers",
    label: "Customers",
    score: customers === null ? 15 : Math.round(clamp((customers / target) * 100, 0, 100)),
    weight: 0.15,
    note:
      customers === null
        ? `Customer count not tracked — ${stage} needs about ${target}.`
        : `${customers} paying customer${customers === 1 ? "" : "s"} of the ~${target} expected at ${stage}.`,
  };

  /* --- validation ------------------------------------------------------- */
  const validationScore = f.hasPayingCustomers
    ? 100
    : Math.round(clamp((f.validationEvidence / 2) * 100, 0, 90));
  const validation: HealthComponent = {
    key: "validation",
    label: "Validation",
    score: validationScore,
    weight: 0.12,
    note: f.hasPayingCustomers
      ? "Someone is paying — demand is proven."
      : `${f.validationEvidence} paid or committed signal(s); 2+ is the bar.`,
  };

  /* --- pipeline --------------------------------------------------------- */
  const leads = f.leadsPerMonth;
  const pipeline: HealthComponent = {
    key: "pipeline",
    label: "Pipeline",
    score: leads === null ? 30 : Math.round(clamp((leads / 20) * 100, 0, 100)),
    weight: 0.13,
    note: leads === null ? "Leads/conversations per month are not tracked." : `${leads} new conversations a month (20 is a working pipeline).`,
  };

  /* --- retention -------------------------------------------------------- */
  const churn = f.churnRate;
  const retention: HealthComponent = {
    key: "retention",
    label: "Retention",
    score: churn === null ? 50 : Math.round(clamp(100 - (churn / 0.15) * 100, 0, 100)),
    weight: 0.12,
    note:
      churn === null
        ? "Churn is not measured — treated as neutral until you know it."
        : `${Math.round(churn * 1000) / 10}% monthly churn (under 5% is healthy).`,
  };

  /* --- systems ---------------------------------------------------------- */
  const systems: HealthComponent = {
    key: "systems",
    label: "Systems",
    score: Math.round(clamp((f.documentedProcesses / 3) * 100, 0, 100)),
    weight: 0.13,
    note: `${f.documentedProcesses} documented process(es); 3 is the bar for reliable delivery.`,
  };

  /* --- clarity ---------------------------------------------------------- */
  const clarityScore =
    (f.hasIdea ? 0.3 : 0) + (f.hasTargetCustomer ? 0.3 : 0) + (f.hasOffer ? 0.4 : 0);
  const clarity: HealthComponent = {
    key: "clarity",
    label: "Clarity",
    score: Math.round(clarityScore * 100),
    weight: 0.15,
    note: [
      f.hasIdea ? "problem stated" : "no problem statement",
      f.hasTargetCustomer ? "customer defined" : "customer undefined",
      f.hasOffer ? "offer priced" : "offer unpriced",
    ].join(", "),
  };

  const components = [traction, customersComponent, validation, pipeline, retention, systems, clarity];
  const score = Math.round(clamp(components.reduce((sum, c) => sum + c.score * c.weight, 0), 1, 100));
  const band: HealthScore["band"] = score >= 75 ? "strong" : score >= 55 ? "stable" : score >= 35 ? "fragile" : "critical";
  const ranked = [...components].sort((a, b) => b.score - a.score);
  const strongest = ranked[0]?.label ?? "—";
  const weakest = ranked[ranked.length - 1]?.label ?? "—";

  return {
    score,
    band,
    components,
    weakest,
    strongest,
    headline: `${band[0].toUpperCase()}${band.slice(1)}: ${score}/100 overall — ${strongest.toLowerCase()} is your strength, ${weakest.toLowerCase()} is dragging it.`,
  };
}
