/**
 * busywork.ts — the anti-busywork guard.
 *
 * Founders reliably replace the uncomfortable constraint work with comfortable
 * meta-work: rebranding, redesigning, "researching", buying courses. This
 * module names the pattern out loud and states why it is not today's job.
 *
 * Pure functions; used by the daily and weekly priority agents.
 */

import type { CoachContext } from "../types";
import { resolveStageInfo } from "./stage-resolver";

interface BusyworkPattern {
  re: RegExp;
  item: string;
  reason: string;
}

export const BUSYWORK_PATTERNS: BusyworkPattern[] = [
  {
    re: /logo|brand(ing)?|colour|color palette|domain name|business name|mood ?board/i,
    item: "Branding, naming and visual identity",
    reason: "No customer has ever paid for a logo. It changes no number today.",
  },
  {
    re: /redesign|new website|website (build|revamp|refresh)|landing page design|web design/i,
    item: "Website redesign",
    reason: "A prettier page does not change the constraint; a conversation does.",
  },
  {
    re: /^(research|market research|read|watch|course|learn|study|tutorial|webinar|podcast)/i,
    item: "Research, courses and learning",
    reason: "Learning feels like progress and consumes the hours the constraint needs. Test with real buyers instead.",
  },
  {
    re: /feature|roadmap|build|refactor|add (a )?dashboard|api|bug/i,
    item: "Building product or features",
    reason: "Building before the constraint is resolved means building the wrong thing.",
  },
  {
    re: /social media|post(ing)? schedule|instagram|tiktok|twitter|x post|content calendar/i,
    item: "Posting on social media for reach",
    reason: "Reach is not demand. Talk to people who can pay, one at a time.",
  },
  {
    re: /ad(s|vertis| campaign)|paid traffic|boost(ed)? post|google ads|facebook ads/i,
    item: "Paid advertising",
    reason: "Buying traffic multiplies whatever your conversion rate already is — including zero.",
  },
  {
    re: /business plan|pitch deck|financial model|projection|spreadsheet model/i,
    item: "Plans, decks and projections",
    reason: "A plan is a hypothesis. Only customers can confirm it.",
  },
  {
    re: /invoice|bookkeep|account(ing|ant)|tax|admin|paperwork|spreadsheet cleanup|email inbox/i,
    item: "Admin and bookkeeping",
    reason: "Real work, wrong order: it never moves the constraint.",
  },
  {
    re: /network(ing)? event|conference|meetup|summit|coffee chat with (peers|founders)/i,
    item: "Networking with peers",
    reason: "Peer conversations are pleasant and rarely produce customers. Prospect instead.",
  },
  {
    re: /hire|recruit|contractor|agency|outsourc/i,
    item: "Hiring or outsourcing",
    reason: "Delegating an undocumented, unresolved constraint multiplies the mess.",
  },
];

export interface Avoidance {
  item: string;
  reason: string;
}

/** Detect busywork in free text (the founder's own plan for today/this week). */
export function detectBusywork(text: string | undefined | null): Avoidance[] {
  if (!text) return [];
  const found: Avoidance[] = [];
  for (const pattern of BUSYWORK_PATTERNS) {
    if (pattern.re.test(text)) found.push({ item: pattern.item, reason: pattern.reason });
  }
  return found.slice(0, 3);
}

/**
 * The two things this founder should NOT do today: whatever their plan says
 * that is busywork, plus the stage's classic trap. Deduplicated, max 3.
 */
export function antiBusyworkAdvice(ctx: CoachContext, constraintDistraction: string): Avoidance[] {
  const stage = resolveStageInfo(ctx);
  const detected = detectBusywork(ctx.input ?? "");
  const out: Avoidance[] = [...detected];
  out.push({
    item: constraintDistraction,
    reason: "It does not move your binding constraint — it only feels productive.",
  });
  out.push({
    item: `Stage-typical trap: ${stage.trap}`,
    reason: `Standing on ${stage.label}, this is the most common way founders lose a week.`,
  });
  const seen = new Set<string>();
  return out.filter((entry) => {
    const key = entry.item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}
