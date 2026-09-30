/**
 * /decision-engine — the 14-step Decision Engine.
 *
 * Start a decision with its real options (plus the pros/cons you already know),
 * then walk the fixed 14-step operator framework one step at a time. The engine
 * scores every option against seven weighted criteria and states the WHY, the
 * opportunity cost, the reversibility and the smallest next step.
 *
 * Walkthroughs are persisted in `decisions` (the `steps` jsonb bag holds the
 * framework, how far you got and your per-step notes), so a decision can be
 * left half-decided and resumed days later.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getDecisionEngine, saveDecisionStep, startDecision } from "~/server/coach/server";
import type { DecisionPageResult } from "~/server/coach/server";
import type {
  CoachResult,
  DecisionGuidanceData,
  DecisionOptionInput,
  DecisionRecord,
} from "~/server/coach/types";
import { Icon } from "~/components/icons";
import {
  CardHead,
  CoachMeta,
  EmptyState,
  ErrorNotice,
  FactList,
  Field,
  MetricChip,
  NeedsOnboarding,
  PageHeader,
  ScoreBar,
  SetupNotice,
} from "~/components/app/tool-ui";

export const Route = createFileRoute("/_app/decision-engine")({
  loader: async (): Promise<DecisionPageResult> => await getDecisionEngine(),
  component: DecisionEngine,
});

const MAX_OPTIONS = 5;

function dateLabel(value: string | null): string {
  if (!value) return "";
  const stamp = Date.parse(value);
  if (Number.isNaN(stamp)) return "";
  return new Date(stamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A walkthrough that was never persisted (database unavailable) still renders. */
function fromResult(
  result: CoachResult<DecisionGuidanceData>,
  prompt: string,
  input: DecisionOptionInput[],
): DecisionRecord {
  return {
    id: "",
    prompt,
    status: "open",
    createdAt: result.generatedAt,
    updatedAt: null,
    doorType: result.data.doorType,
    summary: result.data.summary,
    options: result.data.options,
    criteria: result.data.criteria,
    steps: result.data.steps,
    recommendation: result.data.recommendation,
    progress: 0,
    notes: {},
    input,
  };
}

/* ------------------------------------------------------------------ */
/* Walkthrough                                                         */
/* ------------------------------------------------------------------ */

function OptionInputRow({
  option,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  option: DecisionOptionInput;
  index: number;
  onChange: (index: number, key: keyof DecisionOptionInput, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}) {
  return (
    <li className="rounded-md border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">Option {index + 1}</span>
        {canRemove ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onRemove(index)}
            aria-label={`Remove option ${index + 1}`}
          >
            <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.2} />
            Remove
          </button>
        ) : null}
      </div>
      <input
        className="input mt-2.5"
        value={option.label}
        onChange={(event) => onChange(index, "label", event.target.value)}
        placeholder="e.g. Raise prices 20% next month"
        maxLength={140}
      />
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <input
          className="input"
          value={option.pros}
          onChange={(event) => onChange(index, "pros", event.target.value)}
          placeholder="Pros: what this buys you"
          maxLength={400}
        />
        <input
          className="input"
          value={option.cons}
          onChange={(event) => onChange(index, "cons", event.target.value)}
          placeholder="Cons: what it risks"
          maxLength={400}
        />
      </div>
    </li>
  );
}

function WeightedOptions({ record }: { record: DecisionRecord }) {
  const ranked = [...record.options].sort((a, b) => b.weightedTotal - a.weightedTotal);
  return (
    <ol className="space-y-3">
      {ranked.map((option, index) => {
        const input = record.input.find((entry) => entry.label === option.label);
        const isWinner = record.recommendation?.choice === option.label;
        return (
          <li
            key={`${option.label}-${index}`}
            className={"rounded-md border p-3.5 " + (isWinner ? "border-brand-500 bg-halo" : "border-line bg-surface")}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-semibold">
                {option.label}
                {isWinner ? <span className="badge ml-2">Recommended</span> : null}
              </p>
              <p className="shrink-0 font-mono text-[13px] font-semibold tabular-nums">
                {option.weightedTotal.toFixed(1)}
                <span className="text-[10px] text-fg-faint">/10</span>
              </p>
            </div>
            <ul className="mt-3 space-y-2">
              {option.scores.map((entry) => (
                <ScoreBar key={entry.criterion} label={entry.criterion} score={entry.score} />
              ))}
            </ul>
            {input?.pros ? (
              <p className="mt-3 text-[12px] text-fg-muted">
                <span className="font-mono text-[10px] tracking-[0.12em] text-accent-500 uppercase">You said pro </span>
                {input.pros}
              </p>
            ) : null}
            {input?.cons ? (
              <p className="mt-1.5 text-[12px] text-fg-muted">
                <span className="font-mono text-[10px] tracking-[0.12em] text-risk uppercase">You said con </span>
                {input.cons}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function FinalView({ record, onBack }: { record: DecisionRecord; onBack: () => void }) {
  const rec = record.recommendation;
  const chosen = record.options.find((option) => option.label === rec?.choice);
  const reversibility =
    record.doorType === "one_way_door"
      ? "One-way door — hard to undo. Do the full walkthrough and set a checkpoint date before starting."
      : "Two-way door — cheap to undo. Decide fast, test live and keep the option to revert.";

  return (
    <div className="space-y-5">
      <section className="card p-5 sm:p-6">
        <CardHead
          eyebrow="Step 15 · The call"
          title={rec?.choice ?? "No option scored clearly"}
          icon="bolt"
          right={
            record.doorType ? (
              <span className="badge">
                <span
                  className={"h-1.5 w-1.5 rounded-full " + (record.doorType === "one_way_door" ? "bg-risk" : "bg-accent-500")}
                  aria-hidden
                />
                {record.doorType === "one_way_door" ? "One-way door" : "Two-way door"}
              </span>
            ) : null
          }
        />
        {rec ? (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
              <span className="font-mono text-[10px] tracking-[0.16em] text-brand-600 uppercase dark:text-brand-300">
                Why ·{" "}
              </span>
              {rec.why}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <MetricChip label="confidence" value={`${Math.round(rec.confidence * 100)}%`} />
              {chosen ? <MetricChip label="weighted" value={`${chosen.weightedTotal.toFixed(1)}/10`} /> : null}
              {chosen ? <MetricChip label="score" value={`${chosen.score}/100`} /> : null}
            </div>
            <div className="mt-5 rounded-md border border-line bg-raised p-4">
              <p className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">Smallest next step</p>
              <p className="mt-2 flex items-start gap-2 text-[13px] font-medium">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" strokeWidth={2.4} />
                <span>{rec.firstStep}</span>
              </p>
            </div>
            <div className="mt-3 rounded-md border border-line bg-surface p-4">
              <p className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">Tripwire — reverses if</p>
              <p className="mt-2 text-[13px] text-fg-muted">{rec.reversesIf}</p>
            </div>
            <div className="mt-3 rounded-md border border-line bg-surface p-4">
              <p className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">Reversibility</p>
              <p className="mt-2 text-[13px] text-fg-muted">{reversibility}</p>
            </div>
          </>
        ) : (
          <p className="mt-4 text-[13px] text-fg-muted">
            No options were scored — go back and add at least two real options, including &ldquo;do nothing&rdquo;.
          </p>
        )}
        {record.summary ? <p className="mt-4 text-[12px] leading-relaxed text-fg-faint">{record.summary}</p> : null}
      </section>

      <section className="card p-5 sm:p-6">
        <CardHead eyebrow="Opportunity cost" title="What you give up" icon="git-branch" />
        {rec ? (
          <FactList
            title="Risks you are accepting"
            tone="risk"
            hint="Modelled, mitigable risk — write a mitigation next to each before you start"
            items={rec.risks}
          />
        ) : null}
        {record.options.length > 0 ? (
          <div className="mt-5">
            <p className="eyebrow">Weighted comparison</p>
            <div className="mt-3">
              <WeightedOptions record={record} />
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <Icon name="arrow-right" className="h-4 w-4 rotate-180" strokeWidth={2.2} />
          Back to step 14
        </button>
      </div>
    </div>
  );
}

function Walkthrough({
  record,
  step,
  notes,
  busy,
  onSelectStep,
  onNoteChange,
  onCommit,
  onAbandon,
  onExit,
}: {
  record: DecisionRecord;
  step: number;
  notes: Record<string, string>;
  busy: boolean;
  onSelectStep: (step: number) => void;
  onNoteChange: (key: string, value: string) => void;
  onCommit: () => void;
  onAbandon: () => void;
  onExit: () => void;
}) {
  const total = record.steps.length;
  const isFinal = step >= total;
  const current = record.steps[Math.min(step, total - 1)];
  const percent = Math.round((Math.min(step + 1, total + 1) / (total + 1)) * 100);
  const noteKey = `step-${current.n}`;

  return (
    <div className="space-y-5">
      <section className="card p-5 sm:p-6">
        <CardHead
          eyebrow={isFinal ? "Walkthrough complete" : `Step ${current.n} of ${total}`}
          title={record.prompt}
          icon="loop"
          right={
            <span className="badge">
              <span className={"h-1.5 w-1.5 rounded-full " + (record.status === "decided" ? "bg-accent-500" : "bg-brand-500")} aria-hidden />
              {record.status === "decided" ? "Decided" : "In progress"}
            </span>
          }
        />
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">
          {isFinal ? "Recommendation" : `Step ${current.n} / ${total}`} · {percent}% of the framework
        </p>

        {!isFinal ? (
          <>
            <div className="mt-5">
              <p className="eyebrow">The question</p>
              <h3 className="mt-2 text-lg font-semibold">{current.name}</h3>
              <p className="mt-1.5 text-[14px] text-fg-muted">{current.question}</p>
              <p className="mt-3 rounded-md border border-line bg-raised p-3.5 text-[12px] leading-relaxed text-fg-muted">
                {current.guidance}
              </p>
            </div>
            <Field
              label="Your answer for this step"
              htmlFor={`decision-note-${current.n}`}
              hint="Saved as you move — you can leave and pick this up later."
              className="mt-5"
            >
              <textarea
                id={`decision-note-${current.n}`}
                className="input min-h-[92px]"
                value={notes[noteKey] ?? ""}
                onChange={(event) => onNoteChange(noteKey, event.target.value)}
                placeholder="Write the one sentence that answers this step…"
                maxLength={1200}
              />
            </Field>
          </>
        ) : (
          <div className="mt-5">
            <FinalView record={record} onBack={() => onSelectStep(total - 1)} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onSelectStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <Icon name="arrow-right" className="h-4 w-4 rotate-180" strokeWidth={2.2} />
              Back
            </button>
            <button type="button" className="btn btn-ghost" onClick={onExit}>
              Save &amp; exit
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {step >= 1 && step <= total ? (
              <button type="button" className="btn btn-secondary" onClick={onAbandon} disabled={busy}>
                Set aside
              </button>
            ) : null}
            {isFinal ? (
              <button type="button" className="btn btn-primary" onClick={onCommit} disabled={busy || record.status === "decided"}>
                {busy ? (
                  <Icon name="spinner" className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                ) : (
                  <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                )}
                {record.status === "decided" ? "Decided" : busy ? "Saving…" : "Mark decided"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onSelectStep(step + 1)}
                disabled={busy}
              >
                {step + 1 === total ? "See the recommendation" : "Next step"}
                <Icon name="arrow-right" className="h-4 w-4" strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Step map: click any step to jump, so the walkthrough never traps you. */}
      <section className="card p-5 sm:p-6">
        <CardHead eyebrow="Framework" title="The 14 steps" icon="map" />
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {record.steps.map((entry, index) => {
            const isCurrent = !isFinal && index === step;
            const answered = (notes[`step-${entry.n}`] ?? "").trim().length > 0;
            return (
              <li key={entry.n}>
                <button
                  type="button"
                  onClick={() => onSelectStep(index)}
                  className={
                    "flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors " +
                    (isCurrent
                      ? "border-brand-500 bg-halo"
                      : "border-line bg-surface hover:border-line-strong hover:bg-raised")
                  }
                >
                  <span
                    className={
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold " +
                      (answered
                        ? "bg-accent-500 text-white"
                        : isCurrent
                          ? "bg-brand-600 text-white"
                          : "border border-line-strong bg-surface text-fg-faint")
                    }
                  >
                    {answered ? <Icon name="check" className="h-3 w-3" strokeWidth={2.8} /> : entry.n}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium">{entry.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-fg-faint">{entry.question}</span>
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => onSelectStep(total)}
              className={
                "flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors " +
                (isFinal ? "border-brand-500 bg-halo" : "border-line bg-surface hover:border-line-strong hover:bg-raised")
              }
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface font-mono text-[10px] text-fg-faint">
                <Icon name="bolt" className="h-3 w-3" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium">Recommendation</span>
                <span className="mt-0.5 block truncate text-[11px] text-fg-faint">
                  The call, the WHY, the tripwire
                </span>
              </span>
            </button>
          </li>
        </ol>
      </section>

      <section className="card p-5 sm:p-6">
        <CardHead eyebrow="Criteria" title="What the engine weighs" icon="target" />
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {record.criteria.map((criterion) => (
            <li key={criterion.name} className="rounded-md border border-line bg-surface p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium">{criterion.name}</p>
                <span className="font-mono text-[11px] tabular-nums text-fg-faint">
                  {Math.round(criterion.weight * 100)}%
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-fg-faint">{criterion.why}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function DecisionEngine() {
  const state: DecisionPageResult = Route.useLoaderData();
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [options, setOptions] = useState<DecisionOptionInput[]>([
    { label: "", pros: "", cons: "" },
    { label: "", pros: "", cons: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DecisionRecord[]>(state.ok ? state.history : []);
  const [active, setActive] = useState<DecisionRecord | null>(null);
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});

  function open(record: DecisionRecord) {
    setActive(record);
    setStep(Math.min(record.progress, record.steps.length));
    setNotes(record.notes);
    setError(null);
  }

  function setOption(index: number, key: keyof DecisionOptionInput, value: string) {
    setOptions((previous) => previous.map((option, i) => (i === index ? { ...option, [key]: value } : option)));
  }

  function addOption() {
    setOptions((previous) => (previous.length >= MAX_OPTIONS ? previous : [...previous, { label: "", pros: "", cons: "" }]));
  }

  function removeOption(index: number) {
    setOptions((previous) => (previous.length <= 2 ? previous : previous.filter((_, i) => i !== index)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const filled = options.filter((option) => option.label.trim().length > 0);
    if (title.trim().length === 0 || filled.length < 2) {
      setError("Name the decision and give it at least two real options (including “do nothing”).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reply = await startDecision({ data: { title, context, options: filled } });
      if (reply.ok) {
        const record =
          reply.record ??
          fromResult(reply.result, title.trim(), filled.map((option) => ({ ...option, label: option.label.trim() })));
        setHistory((previous) => (record.id ? [record, ...previous.filter((entry) => entry.id !== record.id)] : previous));
        open(record);
      } else {
        setError(
          reply.reason === "setup"
            ? "The coaching database is being connected — try again in a moment."
            : reply.reason === "no_business"
              ? "Name the decision and add at least two options, then try again."
              : "Your session expired. Log in again to run a decision.",
        );
      }
    } catch {
      // Never leave the button stuck on "Scoring…" — an LLM timeout is common.
      setError("The coach could not score that just now. Your options are still here — try again.");
    }
    setBusy(false);
  }

  /** Wrap an awaited action so the walkthrough controls show a busy state. */
  async function withBusy(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  /** Persist a step move / note / status change (best-effort, never blocking). */
  async function persist(patch: { progress?: number; status?: "open" | "decided" | "abandoned" }) {
    if (!active?.id) return;
    const mergedNotes = { ...notes };
    try {
      const saved = await saveDecisionStep({
        data: { id: active.id, progress: patch.progress, notes: mergedNotes, status: patch.status },
      });
      if (saved.ok && saved.record) {
        setActive(saved.record);
        setHistory((previous) => previous.map((entry) => (entry.id === saved.record?.id ? (saved.record as DecisionRecord) : entry)));
      }
    } catch {
      // Best effort: the walkthrough stays usable locally even if the write fails.
      setError("That step did not save — you can keep walking through, but re-open to sync.");
    }
  }

  function goTo(next: number) {
    const record = active;
    if (!record) return;
    const clamped = Math.max(0, Math.min(record.steps.length, next));
    setStep(clamped);
    void persist({ progress: clamped });
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

  const openRuns = history.filter((record) => record.status === "open");
  const closedRuns = history.filter((record) => record.status !== "open");

  return (
    <div className="container-site py-8 sm:py-12">
      <PageHeader
        eyebrow="Coach tool"
        title="Decision Engine"
        lead="A 14-step operator framework with weighted criteria. Every option is scored against your binding constraint and stage, and the recommendation always states the WHY and the tripwire that would reverse it."
        right={<CoachMeta brain={state.brain} plan={state.plan} />}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {error ? <ErrorNotice message={error} /> : null}

          {active ? (
            <Walkthrough
              record={active}
              step={step}
              notes={notes}
              busy={busy}
              onSelectStep={goTo}
              onNoteChange={(key, value) => setNotes((previous) => ({ ...previous, [key]: value }))}
              onCommit={() => void withBusy(() => persist({ status: "decided", progress: active.steps.length }))}
              onAbandon={() => void withBusy(() => persist({ status: "abandoned" }))}
              onExit={() => {
                void persist({ progress: step });
                setActive(null);
              }}
            />
          ) : (
            <section className="card p-5 sm:p-6">
              <CardHead eyebrow="New decision" title="What are you deciding?" icon="git-branch" />
              <form className="mt-5 space-y-4" onSubmit={onSubmit}>
                <Field label="The decision, in one sentence" htmlFor="decision-title">
                  <input
                    id="decision-title"
                    className="input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Should I raise my prices 20% next month?"
                    maxLength={300}
                    required
                  />
                </Field>
                <Field
                  label="Context (optional)"
                  htmlFor="decision-context"
                  hint="Deadlines, numbers, constraints — anything that makes the call less abstract."
                >
                  <textarea
                    id="decision-context"
                    className="input min-h-[90px]"
                    value={context}
                    onChange={(event) => setContext(event.target.value)}
                    placeholder="Cash is tight, 12 clients on the current plan, churn is 4%/month…"
                    maxLength={2000}
                  />
                </Field>
                <div>
                  <p className="label">Options — including &ldquo;do nothing&rdquo;</p>
                  <ul className="mt-2 space-y-3">
                    {options.map((option, index) => (
                      <OptionInputRow
                        key={index}
                        option={option}
                        index={index}
                        canRemove={options.length > 2}
                        onChange={setOption}
                        onRemove={removeOption}
                      />
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm mt-3"
                    onClick={addOption}
                    disabled={options.length >= MAX_OPTIONS}
                  >
                    <Icon name="spark" className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Add option ({options.length}/{MAX_OPTIONS})
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-fg-faint">
                    Options are scored against 7 weighted criteria. The status quo counts as an option.
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
                        Start the walkthrough
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          )}

          {!active && openRuns.length === 0 && closedRuns.length === 0 ? (
            <EmptyState
              icon="map"
              title="No decisions on the table"
              body="Name a real decision above — one sentence, two or more options — and the coach will walk you through all 14 steps to a dated call."
            />
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-4">
            <CardHead eyebrow="Open" title={`Decisions in progress (${openRuns.length})`} icon="loop" />
            {openRuns.length === 0 ? (
              <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
                Nothing open. Start one and it will wait here until you decide.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {openRuns.map((record) => (
                  <li key={record.id || record.prompt}>
                    <button
                      type="button"
                      onClick={() => open(record)}
                      className={
                        "w-full rounded-md border px-3 py-2.5 text-left transition-colors " +
                        (active?.id === record.id && record.id
                          ? "border-brand-500 bg-raised"
                          : "border-line bg-surface hover:border-line-strong hover:bg-raised")
                      }
                    >
                      <span className="block truncate text-[13px] font-medium">{record.prompt}</span>
                      <span className="mt-1 block font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">
                        Step {Math.min(record.progress + (record.progress >= record.steps.length ? 0 : 1), record.steps.length)} of{" "}
                        {record.steps.length} · {dateLabel(record.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {closedRuns.length > 0 ? (
            <section className="card p-4">
              <CardHead eyebrow="Decided" title={`Calls made (${closedRuns.length})`} icon="check" />
              <ul className="mt-3 space-y-2">
                {closedRuns.map((record) => (
                  <li key={record.id || record.prompt}>
                    <button
                      type="button"
                      onClick={() => open(record)}
                      className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-raised"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-[13px] font-medium">{record.prompt}</span>
                        <span
                          className={
                            "shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase " +
                            (record.status === "decided" ? "text-accent-500" : "text-fg-faint")
                          }
                        >
                          {record.status === "decided" ? "decided" : "set aside"}
                        </span>
                      </span>
                      {record.recommendation?.choice ? (
                        <span className="mt-1 block truncate text-[11px] text-fg-muted">
                          → {record.recommendation.choice}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
