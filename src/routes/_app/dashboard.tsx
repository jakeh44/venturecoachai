import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  coachBottleneck,
  coachDailyPriorities,
  coachWeeklyPlan,
  getDashboard,
} from "~/server/coach/server";
import type {
  DashboardExperiment,
  DashboardPayload,
  DashboardResult,
} from "~/server/coach/server";
import { STAGES, stageIndex } from "~/server/coach/stages";
import type { HealthScore } from "~/server/coach/health";
import type {
  BottleneckData,
  CoachResult,
  DailyPrioritiesData,
  PriorityTask,
  WeeklyPlanData,
} from "~/server/coach/types";
import { Icon } from "~/components/icons";

export const Route = createFileRoute("/_app/dashboard")({
  loader: async (): Promise<DashboardResult> => await getDashboard(),
  component: Dashboard,
});

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function CardHead({
  eyebrow,
  title,
  icon,
  right,
}: {
  eyebrow: string;
  title: string;
  icon?: Parameters<typeof Icon>[0]["name"];
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-raised text-brand-600 dark:text-brand-300">
            <Icon name={icon} className="h-4 w-4" strokeWidth={2} />
          </span>
        ) : null}
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-1 text-[15px] font-semibold">{title}</h2>
        </div>
      </div>
      {right}
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 rounded-md border border-line bg-sunken px-2.5 py-1.5">
      <span className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">{label}</span>
      <span className="font-mono text-[13px] font-medium tabular-nums text-fg">{value}</span>
    </span>
  );
}

function TaskRow({
  task,
  rank,
  badge,
  tone = "brand",
}: {
  task: PriorityTask;
  rank: string;
  badge: string;
  tone?: "brand" | "muted";
}) {
  return (
    <li className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span
            className={
              "flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-semibold " +
              (tone === "brand"
                ? "bg-brand-600 text-white"
                : "border border-line-strong bg-surface text-fg-faint")
            }
          >
            {rank}
          </span>
          <span
            className={
              "font-mono text-[10px] tracking-[0.16em] uppercase " +
              (tone === "brand" ? "text-brand-600 dark:text-brand-300" : "text-fg-faint")
            }
          >
            {badge}
          </span>
        </span>
        <span className="font-mono text-[11px] tabular-nums text-fg-faint">~{task.estMinutes}m</span>
      </div>
      <p className="mt-2.5 text-[15px] font-semibold">{task.title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{task.why}</p>
      <p className="mt-2.5 flex items-start gap-2 text-[13px] text-fg-muted">
        <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" strokeWidth={2.4} />
        <span>
          <span className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
            Done when{" "}
          </span>
          {task.doneWhen}
        </span>
      </p>
    </li>
  );
}

function sourceLabel(result: CoachResult<unknown>): string {
  return result.source === "llm" ? "AI coach" : "deterministic engine";
}

/* ------------------------------------------------------------------ */
/* Stage roadmap                                                       */
/* ------------------------------------------------------------------ */

function StageRoadmap({ current }: { current: string | null }) {
  const active = current ? stageIndex(current) : -1;

  return (
    <div>
      {/* Mobile/tablet: compact list with the focus line on the active stage.
          The ten-label strip needs md+ (and wider gutters) to stay legible. */}
      <ol className="grid grid-cols-1 gap-2 md:hidden">
        {STAGES.map((stage, i) => {
          const isCurrent = i === active;
          return (
            <li
              key={stage.slug}
              className={
                "rounded-md border px-4 py-3 " +
                (isCurrent ? "border-brand-500 bg-halo" : "border-line bg-surface")
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold " +
                    (isCurrent
                      ? "border-brand-500 bg-brand-600 text-white shadow-btn-primary"
                      : i < active
                        ? "border-line-strong bg-raised text-fg-muted"
                        : "border-line-strong bg-surface text-fg-faint")
                  }
                >
                  {i < active ? <Icon name="check" className="h-3 w-3" strokeWidth={2.6} /> : i + 1}
                </span>
                <span className={"text-sm font-medium " + (isCurrent ? "text-fg" : "text-fg-muted")}>
                  {stage.label}
                </span>
                {isCurrent ? <span className="badge ml-auto">You are here</span> : null}
              </div>
              {isCurrent ? <p className="mt-2 text-[13px] text-fg-muted">{stage.focus}</p> : null}
            </li>
          );
        })}
      </ol>

      {/* md+: connected strip, mirroring the landing-page roadmap. */}
      <div className="hidden md:block">
        <div className="relative">
          <div className="absolute top-[13px] right-[5%] left-[5%] h-px bg-line" aria-hidden />
          <ol className="relative grid grid-cols-10">
            {STAGES.map((stage, i) => {
              const isCurrent = i === active;
              const done = i < active;
              return (
                <li key={stage.slug} className="flex flex-col items-center gap-3 text-center">
                  <span
                    className={
                      "flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[10px] font-semibold " +
                      (isCurrent
                        ? "border-brand-500 bg-brand-600 text-white shadow-btn-primary"
                        : done
                          ? "border-line-strong bg-raised text-fg-muted"
                          : "border-line-strong bg-surface text-fg-faint")
                    }
                    title={stage.focus}
                  >
                    {done ? <Icon name="check" className="h-3 w-3" strokeWidth={2.6} /> : i + 1}
                  </span>
                  <span
                    className={
                      "font-mono text-[9px] leading-tight tracking-[0.05em] uppercase xl:text-[11px] xl:tracking-[0.12em] " +
                      (isCurrent ? "font-semibold text-brand-600 dark:text-brand-300" : "text-fg-faint")
                    }
                  >
                    {stage.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-5 text-[13px] text-fg-muted">
          <span className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
            {active >= 0
              ? `Stage ${active + 1} of ${STAGES.length} · `
              : `${STAGES.length} stages · `}
          </span>
          {active >= 0 ? STAGES[active]?.focus : "your stage is detected from your intake"}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Health scorecard                                                    */
/* ------------------------------------------------------------------ */

function HealthBar({ score }: { score: number }) {
  const tone = score >= 70 ? "bg-accent-500" : score >= 40 ? "bg-brand-500" : "bg-risk";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
      <div className={"h-full rounded-full " + tone} style={{ width: `${Math.max(2, score)}%` }} />
    </div>
  );
}

function HealthCard({ health }: { health: HealthScore }) {
  const bandTone =
    health.band === "strong" || health.band === "stable"
      ? "text-accent-500"
      : health.band === "fragile"
        ? "text-warn"
        : "text-risk";

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="health-heading">
      <CardHead eyebrow="Business health" title="Scorecard" icon="gauge" />
      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-4xl font-medium tabular-nums" id="health-heading">
            {health.score}
            <span className="text-lg text-fg-faint">/100</span>
          </p>
          <p className={"mt-1 font-mono text-[11px] tracking-[0.16em] uppercase " + bandTone}>
            {health.band}
          </p>
        </div>
        <div className="text-right text-[12px] text-fg-faint">
          <p>
            strength <span className="text-fg-muted">{health.strongest}</span>
          </p>
          <p className="mt-0.5">
            dragging <span className="text-fg-muted">{health.weakest}</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">{health.headline}</p>

      <ul className="mt-5 flex flex-col gap-3.5">
        {health.components.map((component) => (
          <li key={component.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium">{component.label}</span>
              <span className="font-mono text-[12px] tabular-nums text-fg-muted">
                {component.score}
              </span>
            </div>
            <div className="mt-1.5">
              <HealthBar score={component.score} />
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-fg-faint">{component.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Find the Constraint — the differentiator                            */
/* ------------------------------------------------------------------ */

function ConstraintCard({
  data,
  onRegenerate,
  busy,
}: {
  data: CoachResult<BottleneckData>;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const b = data.data;
  const severity =
    b.severity === "critical" ? "text-risk" : b.severity === "high" ? "text-warn" : "text-fg-muted";

  return (
    <section className="card bg-grid p-5 sm:p-6" aria-labelledby="constraint-heading">
      <CardHead
        eyebrow="Find the constraint"
        title="Your binding constraint"
        icon="target"
        right={
          <div className="flex items-center gap-2">
            <span className="badge">
              <span
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (b.severity === "critical"
                    ? "bg-risk"
                    : b.severity === "high"
                      ? "bg-warn"
                      : "bg-brand-500")
                }
                aria-hidden
              />
              {b.severity}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onRegenerate}
              disabled={busy}
            >
              {busy ? <Icon name="spinner" className="h-4 w-4 animate-spin" /> : "Re-run"}
            </button>
          </div>
        }
      />

      <p className="mt-5 text-lg leading-snug font-semibold" id="constraint-heading">
        Your biggest constraint right now is {b.constraint.toLowerCase()}.
      </p>
      <p className="mt-2 rounded-md border border-warn/30 bg-warn/5 px-3 py-2.5 text-[13px] leading-relaxed text-fg-muted">
        Do not spend your time optimizing <span className="font-medium text-fg">{b.doNotOptimize}</span>{" "}
        until <span className="font-medium text-fg">{b.constraint.toLowerCase()}</span> improves.
      </p>

      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">{b.why}</p>

      {b.evidence.length ? (
        <ul className="mt-4 flex flex-col gap-1.5">
          {b.evidence.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[13px] text-fg-muted">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-faint" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 rounded-md border border-line bg-sunken p-4">
        <p className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">Next action</p>
        <p className="mt-1.5 flex items-start gap-2 text-[14px] font-medium">
          <Icon
            name="bolt"
            className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
            strokeWidth={2}
          />
          {b.nextAction}
        </p>
        <p className="mt-4 font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
          Metric to watch
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <MetricChip label={b.metricToWatch.name} value={b.metricToWatch.target} />
          {b.metricToWatch.why ? (
            <span className="text-[12px] text-fg-faint">{b.metricToWatch.why}</span>
          ) : null}
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-fg-muted">
          <span className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
            Improves when{" "}
          </span>
          {b.improvesWhen}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-fg-faint">
        <span className={"font-mono tracking-[0.14em] uppercase " + severity}>
          severity {b.severity}
        </span>
        <span className="font-mono tabular-nums">confidence {Math.round(b.confidence * 100)}%</span>
        <span className="font-mono">via {sourceLabel(data)}</span>
      </div>

      {b.missingSignals.length ? (
        <p className="mt-3 text-[12px] leading-relaxed text-fg-faint">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase">
            Sharpen it with:{" "}
          </span>
          {b.missingSignals.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Today                                                               */
/* ------------------------------------------------------------------ */

function TodayCard({
  data,
  onRegenerate,
  busy,
}: {
  data: CoachResult<DailyPrioritiesData>;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const d = data.data;

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="today-heading">
      <CardHead
        eyebrow="Today"
        title="What matters today"
        icon="bolt"
        right={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onRegenerate}
            disabled={busy}
          >
            {busy ? <Icon name="spinner" className="h-4 w-4 animate-spin" /> : "Re-run today"}
          </button>
        }
      />

      <p className="mt-5 text-[15px] leading-relaxed font-semibold" id="today-heading">
        {d.headline}
      </p>
      <p className="mt-1.5 text-[13px] text-fg-muted">{d.focusNote}</p>

      <ul className="mt-5 flex flex-col gap-3">
        <TaskRow task={d.topTask} rank="1" badge="Highest leverage" />
        <TaskRow task={d.second} rank="2" badge="Second priority" tone="muted" />
        {d.optional ? (
          <TaskRow task={d.optional} rank="3" badge="If time allows" tone="muted" />
        ) : null}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <MetricChip label={d.metric.name} value={d.metric.target} />
        <span className="font-mono text-[11px] text-fg-faint">via {sourceLabel(data)}</span>
      </div>

      {d.avoid.length ? (
        <div className="mt-5 rounded-md border border-risk/30 bg-risk/5 p-4">
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-risk uppercase">
            <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.4} />
            Not today — this is busywork
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {d.avoid.map((entry) => (
              <li key={entry.item} className="text-[13px] leading-relaxed">
                <span className="font-medium text-fg">{entry.item}</span>
                <span className="text-fg-muted"> — {entry.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 rounded-md border border-line bg-raised p-4">
        <p className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
          Coaching question
        </p>
        <p className="mt-1.5 text-[14px] leading-relaxed">{d.coachingQuestion}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* This week                                                           */
/* ------------------------------------------------------------------ */

function WeekCard({
  data,
  onRegenerate,
  busy,
}: {
  data: CoachResult<WeeklyPlanData>;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const w = data.data;

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="week-heading">
      <CardHead
        eyebrow={`Week of ${w.weekOf}`}
        title="This week"
        icon="calendar"
        right={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onRegenerate}
            disabled={busy}
          >
            {busy ? <Icon name="spinner" className="h-4 w-4 animate-spin" /> : "Re-plan week"}
          </button>
        }
      />

      <p className="mt-5 text-[15px] leading-relaxed font-semibold" id="week-heading">
        {w.objective}
      </p>

      <p className="mt-5 font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
        Top 3 priorities
      </p>
      <ol className="mt-2.5 flex flex-col gap-2.5">
        {w.priorities.slice(0, 3).map((priority, i) => (
          <li key={priority} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface font-mono text-[10px] font-semibold text-fg-muted">
              {i + 1}
            </span>
            <span className="text-[14px] leading-relaxed">{priority}</span>
          </li>
        ))}
      </ol>

      {w.actions.length ? (
        <ul className="mt-4 flex flex-col gap-2">
          {w.actions.map((action) => (
            <li key={action.title} className="flex items-start gap-2 text-[13px] text-fg-muted">
              <Icon
                name="check"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500"
                strokeWidth={2.4}
              />
              <span>
                <span className="text-fg">{action.title}</span> — {action.doneWhen}{" "}
                <span className="font-mono text-[11px] text-fg-faint">({action.effort})</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 rounded-md border border-brand-500/30 bg-halo p-4">
        <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-brand-600 uppercase dark:text-brand-300">
          <Icon name="flask" className="h-3.5 w-3.5" strokeWidth={2.2} />
          The one experiment
        </p>
        <p className="mt-2 text-[14px] font-medium">{w.experiment.title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{w.experiment.hypothesis}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MetricChip label={w.experiment.metric} value={w.experiment.successThreshold} />
          <span className="font-mono text-[11px] text-fg-faint">
            {w.experiment.durationDays} days
          </span>
        </div>
      </div>

      {w.metrics.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {w.metrics.map((metric) => (
            <MetricChip key={metric.name} label={metric.name} value={metric.target} />
          ))}
        </div>
      ) : null}

      <p className="mt-4 rounded-md border border-line bg-raised p-4 text-[13px] leading-relaxed">
        <span className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
          Commitment{" "}
        </span>
        {w.accountability.commitment}{" "}
        <span className="text-fg-muted">
          ({w.accountability.checkIn}; {w.accountability.consequence})
        </span>
      </p>
      <p className="mt-3 text-[12px] text-fg-faint">
        <span className="font-mono tracking-[0.14em] uppercase">Stage focus · </span>
        {w.stageFocus} · via {sourceLabel(data)}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Experiments                                                         */
/* ------------------------------------------------------------------ */

function ExperimentsCard({ experiments }: { experiments: DashboardExperiment[] }) {
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="experiments-heading">
      <CardHead eyebrow="Experiment tracker" title="Active experiments" icon="flask" />
      {experiments.length ? (
        <ul className="mt-5 flex flex-col gap-3" id="experiments-heading">
          {experiments.map((experiment) => (
            <li key={experiment.id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] font-semibold">{experiment.title}</p>
                <span className="badge">
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (experiment.status === "running" ? "bg-warn animate-pulse-soft" : "bg-fg-faint")
                    }
                    aria-hidden
                  />
                  {experiment.status}
                </span>
              </div>
              {experiment.hypothesis ? (
                <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
                  {experiment.hypothesis}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-fg-faint">
                {experiment.metric ? <MetricChip label="metric" value={experiment.metric} /> : null}
                {experiment.startedAt ? (
                  <span className="font-mono">
                    started {new Date(experiment.startedAt).toISOString().slice(0, 10)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[13px] text-fg-muted" id="experiments-heading">
          No experiments running yet — the weekly coach adds one here automatically when you re-plan
          your week.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function Notice({
  eyebrow,
  title,
  body,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cta?: ReactNode;
}) {
  return (
    <div className="card bg-grid p-8 text-center sm:p-12">
      <Icon name="loop" className="mx-auto h-6 w-6 text-fg-faint" strokeWidth={2} />
      <p className="eyebrow mt-4">{eyebrow}</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-fg-muted">{body}</p>
      {cta ? <div className="mt-6 flex justify-center gap-3">{cta}</div> : null}
    </div>
  );
}

/** The roadmap is product data, so it can render before a business exists. */
function RoadmapPreview() {
  return (
    <section className="card mt-6 p-5 sm:p-6">
      <CardHead eyebrow="The roadmap" title="Ten stages. One at a time." icon="map" />
      <div className="mt-5">
        <StageRoadmap current={null} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function Dashboard() {
  const result = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState<"daily" | "weekly" | "bottleneck" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Re-run one intent, then re-read the loader so every card agrees. */
  async function regenerate(which: "daily" | "weekly" | "bottleneck") {
    if (busy) return;
    setBusy(which);
    setNotice(null);
    try {
      const reply =
        which === "daily"
          ? await coachDailyPriorities({ data: { regenerate: true } })
          : which === "weekly"
            ? await coachWeeklyPlan({ data: { regenerate: true } })
            : await coachBottleneck({ data: { regenerate: true } });
      if (reply.ok && reply.result.limited) {
        setNotice("Your plan's limits are reached for today — showing your cached coaching.");
      }
      await router.invalidate();
    } catch {
      setNotice("The coach could not re-run that just now — your last plan is still valid.");
    } finally {
      setBusy(null);
    }
  }

  if (!result.ok) {
    if (result.reason === "setup") {
      return (
        <div className="container-site py-10 sm:py-14">
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">The coached loop is standing by.</h1>
          <Notice
            eyebrow="Setup"
            title="Accounts are being connected"
            body="Business memory, stage detection and the daily plan are stored in a database, which is being wired up. The roadmap and the coach's method are already here."
            cta={
              <>
                <Link to="/onboarding" className="btn btn-secondary">
                  Preview the founder intake
                </Link>
                <a href="/" className="btn btn-ghost">
                  Back to home
                </a>
              </>
            }
          />
          <RoadmapPreview />
        </div>
      );
    }
    return (
      <div className="container-site py-10 sm:py-14">
        <Notice
          eyebrow="Dashboard"
          title="Your session has expired"
          body="Log in again and the coach will pick up exactly where you left off."
          cta={
            <a href="/login" className="btn btn-primary">
              Log in
            </a>
          }
        />
      </div>
    );
  }

  const payload: DashboardPayload = result;
  const firstName = (payload.founderName ?? "").trim().split(/\s+/)[0] || "founder";

  if (!payload.hasBusiness) {
    return (
      <div className="container-site py-10 sm:py-14">
        <p className="eyebrow">Dashboard</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Good morning, {firstName}.</h1>
        <p className="mt-2 max-w-xl text-sm text-fg-muted">
          The coach needs your business memory before it can prioritise anything. Seventeen questions,
          about five minutes — you never answer them again.
        </p>
        <div className="mt-8">
          <Notice
            eyebrow="Step 0"
            title="Complete onboarding to start the coached loop"
            body="Tell the coach what you're building, who it's for and what you've proven so far. It will detect your stage, find your constraint and write today's plan — decision, action, metric."
            cta={
              <Link to="/onboarding" className="btn btn-primary">
                Complete onboarding
                <Icon name="arrow-right" className="h-4 w-4" strokeWidth={2} />
              </Link>
            }
          />
        </div>
        <RoadmapPreview />
      </div>
    );
  }

  const stageResult = payload.stage;
  const stageSlug = stageResult?.data.stage ?? payload.business?.stage ?? "find";
  const objective =
    payload.weekly?.data.objective ??
    payload.daily?.data.objective ??
    (payload.bottleneck
      ? `Break the constraint: ${payload.bottleneck.data.constraint}`
      : "Confirm your stage milestone");

  return (
    <div className="container-site py-8 sm:py-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Good morning, {firstName}.</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            {payload.business?.name}
            {payload.business?.description ? ` — ${payload.business.description}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
            {payload.plan} plan
          </span>
          <span className="badge" title="Which brain produced this session">
            <Icon name={payload.brain.llm ? "bot" : "loop"} className="h-3.5 w-3.5" strokeWidth={2.2} />
            {payload.brain.llm ? payload.brain.model : "deterministic engine"}
          </span>
        </div>
      </header>

      {/* Current objective */}
      <section className="card mt-6 flex flex-wrap items-center gap-4 p-5 sm:flex-nowrap">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-halo text-brand-600 dark:text-brand-300">
          <Icon name="target" className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Current objective</p>
          <p className="mt-1 text-[15px] leading-snug font-semibold">{objective}</p>
        </div>
        <Link to="/onboarding" className="btn btn-ghost btn-sm shrink-0 sm:ml-auto">
          Update business memory
        </Link>
      </section>

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-md border border-line bg-raised px-3 py-2.5 text-[13px] text-fg-muted"
        >
          {notice}
        </p>
      ) : null}

      {/* Stage */}
      <section className="card mt-4 p-5 sm:p-6" aria-labelledby="stage-heading">
        <CardHead
          eyebrow="Business stage"
          title={
            stageResult
              ? `Stage ${stageResult.data.index + 1} — ${stageResult.data.label}`
              : "Find"
          }
          icon="map"
          right={
            <span className="badge">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
              {stageResult
                ? `${stageResult.data.progress}% through the roadmap`
                : "detected from your intake"}
            </span>
          }
        />
        {stageResult ? (
          <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
            <span className="font-medium text-fg">{stageResult.data.focus}.</span>{" "}
            {stageResult.data.why}
          </p>
        ) : null}
        <div className="mt-5" id="stage-heading">
          <StageRoadmap current={stageSlug} />
        </div>
        {stageResult ? (
          <p className="mt-5 border-t border-line pt-4 text-[13px] leading-relaxed text-fg-muted">
            <span className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
              Stage milestone ·{" "}
            </span>
            {stageResult.data.nextMilestone}
          </p>
        ) : null}
      </section>

      {/* Health + constraint */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {payload.health ? (
          <HealthCard health={payload.health} />
        ) : (
          <section className="card p-6">
            <CardHead eyebrow="Business health" title="Scorecard" icon="gauge" />
            <p className="mt-4 text-[13px] text-fg-muted">
              Health score appears once the coach has your numbers.
            </p>
          </section>
        )}
        {payload.bottleneck ? (
          <ConstraintCard
            data={payload.bottleneck}
            busy={busy === "bottleneck"}
            onRegenerate={() => void regenerate("bottleneck")}
          />
        ) : (
          <section className="card p-6">
            <CardHead eyebrow="Find the constraint" title="Your binding constraint" icon="target" />
            <p className="mt-4 text-[13px] text-fg-muted">
              Constraint detection runs with your first coached session.
            </p>
          </section>
        )}
      </div>

      {/* Today + week */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {payload.daily ? (
          <TodayCard
            data={payload.daily}
            busy={busy === "daily"}
            onRegenerate={() => void regenerate("daily")}
          />
        ) : (
          <section className="card p-6">
            <CardHead eyebrow="Today" title="What matters today" icon="bolt" />
            <p className="mt-4 text-[13px] text-fg-muted">
              Today's priorities are generated with your first coached session.
            </p>
          </section>
        )}
        {payload.weekly ? (
          <WeekCard
            data={payload.weekly}
            busy={busy === "weekly"}
            onRegenerate={() => void regenerate("weekly")}
          />
        ) : (
          <section className="card p-6">
            <CardHead eyebrow="This week" title="Weekly coach" icon="calendar" />
            <p className="mt-4 text-[13px] text-fg-muted">
              Your weekly objective, three priorities and one experiment appear here.
            </p>
          </section>
        )}
      </div>

      <div className="mt-4">
        <ExperimentsCard experiments={payload.experiments} />
      </div>
    </div>
  );
}
