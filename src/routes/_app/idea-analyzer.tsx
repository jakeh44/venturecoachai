/**
 * /idea-analyzer — the Business Idea Analyzer.
 *
 * The founder types an idea (title + description + optional colour), the
 * `idea_analysis` agent scores it 1–10 across all 15 categories, and the page
 * renders the weighted Business Opportunity Score, the KNOWN / ASSUMED /
 * UNKNOWN split and the cheapest-first Validation Plan. Every run is persisted
 * to `idea_analyses`, so the history below is real Business memory: click a past
 * analysis to re-view the full artifact with no extra round trip.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { analyzeIdea, getIdeaAnalyzer } from "~/server/coach/server";
import type { AnalyzeIdeaReply, IdeaAnalyzerResult } from "~/server/coach/server";
import type { IdeaAnalysisRecord, IdeaCategoryScore, ValidationStep } from "~/server/coach/types";
import { Icon } from "~/components/icons";
import {
  CardHead,
  CoachMeta,
  EmptyState,
  ErrorNotice,
  FactList,
  Field,
  NeedsOnboarding,
  PageHeader,
  ScoreBar,
  ScoreDial,
  SetupNotice,
  SourceBadge,
} from "~/components/app/tool-ui";

export const Route = createFileRoute("/_app/idea-analyzer")({
  loader: async (): Promise<IdeaAnalyzerResult> => await getIdeaAnalyzer(),
  component: IdeaAnalyzer,
});

/** One rendered analysis, whether it just came back from the engine or history. */
interface AnalysisView {
  key: string;
  title: string | null;
  createdAt: string | null;
  source: "llm" | "deterministic";
  limited: boolean;
  overallScore: number;
  grade: string | null;
  verdict: string | null;
  summary: string | null;
  categories: IdeaCategoryScore[];
  knownAssumedUnknown: { known: string[]; assumed: string[]; unknown: string[] };
  validationPlan: ValidationStep[];
  strengths: string[];
  risks: string[];
}

function dateLabel(value: string | null): string {
  if (!value) return "";
  const stamp = Date.parse(value);
  if (Number.isNaN(stamp)) return "";
  return new Date(stamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fromRecord(record: IdeaAnalysisRecord): AnalysisView {
  return {
    key: record.id || `record-${record.createdAt ?? "unknown"}`,
    title: record.title,
    createdAt: record.createdAt,
    source: record.source,
    limited: false,
    overallScore: record.overallScore,
    grade: record.grade,
    verdict: record.verdict,
    summary: record.summary,
    categories: record.categories,
    knownAssumedUnknown: record.knownAssumedUnknown,
    validationPlan: record.validationPlan,
    strengths: [],
    risks: [],
  };
}

function fromReply(reply: Extract<AnalyzeIdeaReply, { ok: true }>): AnalysisView {
  const data = reply.result.data;
  return {
    key: reply.record?.id ?? `fresh-${reply.result.generatedAt}`,
    title: reply.record?.title ?? null,
    createdAt: reply.record?.createdAt ?? reply.result.generatedAt,
    source: reply.result.source,
    limited: reply.result.limited === true,
    overallScore: data.overallScore,
    grade: data.grade,
    verdict: data.verdict,
    summary: data.summary,
    categories: data.categories,
    knownAssumedUnknown: data.knownAssumedUnknown,
    validationPlan: data.validationPlan,
    strengths: data.strengths,
    risks: data.risks,
  };
}

function PlanStep({ step, index }: { step: ValidationStep; index: number }) {
  return (
    <li className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 font-mono text-[10px] font-semibold text-white">
            {index + 1}
          </span>
          <span className="font-mono text-[10px] tracking-[0.16em] text-brand-600 uppercase dark:text-brand-300">
            Test {index + 1}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">
          <span>{step.cost}</span>
          <span aria-hidden>·</span>
          <span>{step.timeframe}</span>
        </span>
      </div>
      <p className="mt-2.5 text-[15px] font-semibold">{step.title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{step.method}</p>
      <dl className="mt-3 space-y-1.5 text-[12px]">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">Kills</dt>
          <dd className="text-fg-muted">{step.assumption}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">Pass signal</dt>
          <dd className="flex items-start gap-1.5 text-fg-muted">
            <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-500" strokeWidth={2.4} />
            <span>{step.successSignal}</span>
          </dd>
        </div>
      </dl>
    </li>
  );
}

function AnalysisResult({ view }: { view: AnalysisView }) {
  return (
    <div className="space-y-5">
      <section className="card p-5 sm:p-6">
        <CardHead
          eyebrow="Analysis result"
          title={view.title ?? "Business idea analysis"}
          icon="crosshair"
          right={<SourceBadge source={view.source} />}
        />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <ScoreDial score={view.overallScore} grade={view.grade} />
          {view.createdAt ? (
            <span className="font-mono text-[11px] text-fg-faint">{dateLabel(view.createdAt)}</span>
          ) : null}
        </div>
        {view.verdict ? <p className="mt-4 text-[15px] font-medium">{view.verdict}</p> : null}
        {view.summary ? <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{view.summary}</p> : null}
        {view.limited ? (
          <p className="mt-4 rounded-md border border-line bg-sunken px-3.5 py-2.5 text-[12px] text-fg-muted">
            You have reached this month&rsquo;s analysis limit on your plan — the result above is your last saved
            analysis. Upgrade to run more.
          </p>
        ) : null}
      </section>

      <section className="card p-5 sm:p-6">
        <CardHead
          eyebrow="15 categories"
          title="Where the score comes from"
          icon="layers"
          right={<span className="badge">{view.categories.length} scored</span>}
        />
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {view.categories.map((category) => (
            <ScoreBar
              key={category.key}
              label={category.label}
              score={category.score}
              detail={category.reason}
              meta={`weight ${Math.round(category.weight * 100)}%`}
            />
          ))}
        </ul>
      </section>

      <section className="card p-5 sm:p-6">
        <CardHead
          eyebrow="What we know"
          title="Known / assumed / unknown"
          icon="target"
          right={
            <span className="badge">
              {view.knownAssumedUnknown.known.length} known · {view.knownAssumedUnknown.assumed.length} assumed ·{" "}
              {view.knownAssumedUnknown.unknown.length} unknown
            </span>
          }
        />
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <FactList
            title="Known"
            tone="accent"
            hint="Facts you told us — each one is evidence"
            items={view.knownAssumedUnknown.known}
            emptyText="Answer more intake questions to build your known list."
          />
          <FactList
            title="Assumed"
            tone="brand"
            hint="Beliefs that would sink the idea if wrong"
            items={view.knownAssumedUnknown.assumed}
            emptyText="No risky assumptions detected."
          />
          <FactList
            title="Unknown"
            tone="risk"
            hint="Not researched yet — the plan below targets these"
            items={view.knownAssumedUnknown.unknown}
          />
        </div>
        {view.strengths.length > 0 || view.risks.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <FactList title="Strengths" tone="accent" items={view.strengths} />
            <FactList title="Risks" tone="risk" items={view.risks} />
          </div>
        ) : null}
      </section>

      <section className="card p-5 sm:p-6">
        <CardHead
          eyebrow="Validation plan"
          title="Cheapest test first"
          icon="flask"
          right={<span className="badge">{view.validationPlan.length} tests</span>}
        />
        {view.validationPlan.length === 0 ? (
          <p className="mt-4 text-[13px] text-fg-muted">
            No validation steps were generated for this analysis — re-run it with a fuller description.
          </p>
        ) : (
          <ol className="mt-5 space-y-3">
            {view.validationPlan.map((step, index) => (
              <PlanStep key={`${step.title}-${index}`} step={step} index={index} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function IdeaAnalyzer() {
  const state: IdeaAnalyzerResult = Route.useLoaderData();
  const [form, setForm] = useState({
    title: "",
    description: "",
    targetCustomer: "",
    alternative: "",
    priceRange: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<IdeaAnalysisRecord[]>(
    state.ok ? state.history : [],
  );
  const [active, setActive] = useState<AnalysisView | null>(null);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (form.title.trim().length === 0 || form.description.trim().length === 0) {
      setError("An idea needs a title and a one-paragraph description.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reply = await analyzeIdea({
        data: {
          title: form.title,
          description: form.description,
          targetCustomer: form.targetCustomer,
          alternative: form.alternative,
          priceRange: form.priceRange,
        },
      });
      if (reply.ok) {
        setActive(fromReply(reply));
        if (reply.record) {
          const record = reply.record;
          setHistory((previous) => [record, ...previous.filter((entry) => entry.id !== record.id)]);
        }
      } else {
        setError(
          reply.reason === "setup"
            ? "The coaching database is being connected — try again in a moment."
            : reply.reason === "no_business"
              ? "Add a title and description, and finish onboarding first."
              : "Your session expired. Log in again to analyze an idea.",
        );
      }
    } catch {
      // Never leave the button stuck on "Scoring…" — an LLM timeout is common.
      setError("The coach could not score that just now. Your text is still here — try again.");
    }
    setBusy(false);
  }

  if (!state.ok) {
    return (
      <div className="container-site py-8 sm:py-12">
        {state.reason === "setup" ? <SetupNotice /> : <NeedsOnboarding />}
      </div>
    );
  }

  if (!state.hasBusiness) {
    return (
      <div className="container-site py-8 sm:py-12">
        <NeedsOnboarding />
      </div>
    );
  }

  return (
    <div className="container-site py-8 sm:py-12">
      <PageHeader
        eyebrow="Coach tool"
        title="Business Idea Analyzer"
        lead="Score an idea 1–10 across 15 categories, see the weighted Business Opportunity Score, and get the cheapest tests that would prove or kill it — before you spend money."
        right={<CoachMeta brain={state.brain} plan={state.plan} />}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5 sm:p-6">
            <CardHead eyebrow="New analysis" title="Describe the idea" icon="crosshair" />
            <form className="mt-5 space-y-4" onSubmit={onSubmit}>
              <Field label="Idea title" htmlFor="idea-title">
                <input
                  id="idea-title"
                  className="input"
                  value={form.title}
                  onChange={(event) => set("title", event.target.value)}
                  placeholder="e.g. Compliance calendar for small clinics"
                  maxLength={200}
                  required
                />
              </Field>
              <Field
                label="What is it, and who pays?"
                htmlFor="idea-description"
                hint="The more concrete the words, the sharper the scoring — pricing, channel and pain all come from this text."
              >
                <textarea
                  id="idea-description"
                  className="input min-h-[120px]"
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder="A monthly subscription that tracks clinic licence renewals and sends reminders…"
                  maxLength={4000}
                  required
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Target customer (optional)" htmlFor="idea-customer">
                  <input
                    id="idea-customer"
                    className="input"
                    value={form.targetCustomer}
                    onChange={(event) => set("targetCustomer", event.target.value)}
                    placeholder="Single-location dental clinics"
                    maxLength={400}
                  />
                </Field>
                <Field label="What they use today (optional)" htmlFor="idea-alternative">
                  <input
                    id="idea-alternative"
                    className="input"
                    value={form.alternative}
                    onChange={(event) => set("alternative", event.target.value)}
                    placeholder="A spreadsheet the office manager keeps"
                    maxLength={400}
                  />
                </Field>
              </div>
              <Field
                label="Price range (optional)"
                htmlFor="idea-price"
                hint="A number here strengthens willingness-to-pay and margin."
              >
                <input
                  id="idea-price"
                  className="input"
                  value={form.priceRange}
                  onChange={(event) => set("priceRange", event.target.value)}
                  placeholder="$49/month"
                  maxLength={120}
                />
              </Field>

              {error ? <ErrorNotice message={error} /> : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-fg-faint">
                  Every run is saved to your business memory — you can re-open it below.
                </p>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? (
                    <>
                      <Icon name="spinner" className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                      Scoring…
                    </>
                  ) : (
                    <>
                      <Icon name="bolt" className="h-4 w-4" strokeWidth={2.2} />
                      Analyze this idea
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {active ? (
            <AnalysisResult view={active} />
          ) : history.length > 0 ? (
            <EmptyState
              icon="crosshair"
              title="Re-open a past analysis"
              body="Pick one from your history on the right to see its scores, the known/assumed/unknown split and its validation plan."
              action={
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActive(fromRecord(history[0]))}>
                  View latest analysis
                </button>
              }
            />
          ) : (
            <EmptyState
              icon="crosshair"
              title="No analysis yet"
              body="Describe an idea above and the coach will score it across 15 categories, then hand you the cheapest validation steps."
            />
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-4">
            <CardHead eyebrow="History" title={`Past analyses (${history.length})`} icon="clipboard" />
            {history.length === 0 ? (
              <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
                Nothing saved yet. Your first analysis will appear here with its score.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {history.map((record) => {
                  const view = fromRecord(record);
                  const isActive = active?.key === view.key;
                  return (
                    <li key={view.key}>
                      <button
                        type="button"
                        onClick={() => setActive(view)}
                        className={
                          "w-full rounded-md border px-3 py-2.5 text-left transition-colors " +
                          (isActive
                            ? "border-brand-500 bg-raised"
                            : "border-line bg-surface hover:border-line-strong hover:bg-raised")
                        }
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-medium">
                            {record.title ?? "Business idea"}
                          </span>
                          <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums">
                            {record.overallScore}
                            <span className="text-[10px] text-fg-faint">/100</span>
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">
                          {record.grade ? <span>{record.grade}</span> : null}
                          <span aria-hidden>·</span>
                          <span>{dateLabel(record.createdAt)}</span>
                          <span aria-hidden>·</span>
                          <span>{record.source === "llm" ? "AI" : "det."}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <p className="eyebrow">The loop</p>
            <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
              A score is not a verdict. Every analysis ends in tests you can run this week, then logged in the{" "}
              <Link to="/experiments" className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-300">
                Experiment tracker
              </Link>
              .
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
