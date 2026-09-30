/**
 * /experiments — the Experiment tracker.
 *
 * Every experiment is a hypothesis with a number attached: expected result,
 * success metric, failure threshold, cost and time, plus start/end dates.
 * Finished experiments keep their outcome and learning, so the history panel
 * stops the founder re-running a test the business has already answered.
 *
 * Persistence lives in `experiments`: the dashboard-compatible columns
 * (title / hypothesis / metric / status / started_at) plus a `result` jsonb bag
 * for the tracker-only fields.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { createExperiment, getExperiments, updateExperiment } from "~/server/coach/server";
import type { ExperimentsResult } from "~/server/coach/server";
import type { ExperimentRecord, ExperimentStatus } from "~/server/coach/types";
import { Icon } from "~/components/icons";
import {
  CardHead,
  CoachMeta,
  EmptyState,
  ErrorNotice,
  Field,
  MetricChip,
  NeedsOnboarding,
  PageHeader,
  SetupNotice,
  StatusBadge,
} from "~/components/app/tool-ui";

export const Route = createFileRoute("/_app/experiments")({
  loader: async (): Promise<ExperimentsResult> => await getExperiments(),
  component: Experiments,
});

const STATUS_ORDER: ExperimentStatus[] = ["running", "proposed", "done", "dropped"];

const EMPTY_FORM = {
  title: "",
  hypothesis: "",
  expectedResult: "",
  metric: "",
  failureThreshold: "",
  cost: "",
  timeRequired: "",
  startedAt: "",
  endedAt: "",
  status: "proposed" as ExperimentStatus,
};

function dayInput(value: string | null): string {
  if (!value) return "";
  const stamp = Date.parse(value);
  if (Number.isNaN(stamp)) return "";
  return new Date(stamp).toISOString().slice(0, 10);
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Overlap between a new title and a finished one ("have we tested this?"). */
function similarPastExperiment(form: string, past: ExperimentRecord[]): ExperimentRecord | null {
  const candidate = normalise(form);
  if (candidate.length < 6) return null;
  const words = new Set(candidate.split(" ").filter((word) => word.length > 3));
  for (const record of past) {
    const other = normalise(record.title);
    if (other === candidate) return record;
    const overlap = other.split(" ").filter((word) => word.length > 3 && words.has(word)).length;
    if (overlap >= 2) return record;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

function ExperimentCard({
  record,
  busy,
  onStatus,
  onSave,
}: {
  record: ExperimentRecord;
  busy: boolean;
  onStatus: (record: ExperimentRecord, status: ExperimentStatus) => void;
  onSave: (id: string, patch: { outcome: string; learning: string }) => void;
}) {
  const [outcome, setOutcome] = useState(record.outcome ?? "");
  const [learning, setLearning] = useState(record.learning ?? "");
  const dirty = outcome !== (record.outcome ?? "") || learning !== (record.learning ?? "");

  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{record.title}</h3>
          {record.hypothesis ? <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{record.hypothesis}</p> : null}
        </div>
        <StatusBadge status={record.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {record.metric ? <MetricChip label="metric" value={record.metric} /> : null}
        {record.cost ? <MetricChip label="cost" value={record.cost} /> : null}
        {record.timeRequired ? <MetricChip label="time" value={record.timeRequired} /> : null}
        {record.startedAt ? <MetricChip label="start" value={dayInput(record.startedAt)} /> : null}
        {record.endedAt ? <MetricChip label="end" value={dayInput(record.endedAt)} /> : null}
      </div>

      <dl className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {record.expectedResult ? (
          <div className="rounded-md border border-line bg-surface p-3">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-fg-faint uppercase">Expected result</dt>
            <dd className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">{record.expectedResult}</dd>
          </div>
        ) : null}
        {record.failureThreshold ? (
          <div className="rounded-md border border-line bg-surface p-3">
            <dt className="font-mono text-[10px] tracking-[0.14em] text-risk uppercase">Failure threshold</dt>
            <dd className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">{record.failureThreshold}</dd>
          </div>
        ) : null}
      </dl>

      {(record.status === "running" || record.status === "done" || record.status === "dropped") && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Result" htmlFor={`outcome-${record.id}`}>
            <textarea
              id={`outcome-${record.id}`}
              className="input min-h-[76px]"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              placeholder="What actually happened — the number, not the story."
              maxLength={1200}
            />
          </Field>
          <Field label="Learning" htmlFor={`learning-${record.id}`}>
            <textarea
              id={`learning-${record.id}`}
              className="input min-h-[76px]"
              value={learning}
              onChange={(event) => setLearning(event.target.value)}
              placeholder="The one sentence you would tell yourself before running this again."
              maxLength={1200}
            />
          </Field>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {record.status === "proposed" ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onStatus(record, "running")}>
              <Icon name="bolt" className="h-3.5 w-3.5" strokeWidth={2.2} />
              Start
            </button>
          ) : null}
          {record.status === "running" ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onStatus(record, "done")}>
              <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />
              Mark done
            </button>
          ) : null}
          {record.status === "running" || record.status === "proposed" ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onStatus(record, "dropped")}>
              <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.2} />
              Drop
            </button>
          ) : null}
          {record.status === "done" || record.status === "dropped" ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onStatus(record, "running")}>
              Reopen
            </button>
          ) : null}
        </div>
        {record.status !== "proposed" ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !dirty}
            onClick={() => onSave(record.id, { outcome, learning })}
          >
            {dirty ? "Save result" : "Saved"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function Experiments() {
  const state: ExperimentsResult = Route.useLoaderData();
  const [list, setList] = useState<ExperimentRecord[]>(state.ok ? state.experiments : []);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function upsert(record: ExperimentRecord) {
    setList((previous) => {
      const exists = previous.some((entry) => entry.id === record.id);
      return exists ? previous.map((entry) => (entry.id === record.id ? record : entry)) : [record, ...previous];
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (form.title.trim().length === 0) {
      setError("Give the experiment a title — it is what the dashboard and history will show.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reply = await createExperiment({
        data: {
          title: form.title,
          hypothesis: form.hypothesis,
          metric: form.metric,
          expectedResult: form.expectedResult,
          failureThreshold: form.failureThreshold,
          cost: form.cost,
          timeRequired: form.timeRequired,
          startedAt: form.startedAt || null,
          endedAt: form.endedAt || null,
          status: form.status,
        },
      });
      if (reply.ok && reply.experiment) {
        upsert(reply.experiment);
        setForm({ ...EMPTY_FORM });
        setShowForm(false);
      } else {
        setError(
          reply.ok
            ? "The experiment was not saved — try again."
            : reply.reason === "setup"
              ? "The coaching database is being connected — try again in a moment."
              : reply.reason === "no_business"
                ? "Finish onboarding before tracking experiments."
                : "Your session expired. Log in again to continue.",
        );
      }
    } catch {
      // Never leave the button stuck on "Saving…".
      setError("That did not save just now. Your draft is still here — try again.");
    }
    setBusy(false);
  }

  async function onStatus(record: ExperimentRecord, status: ExperimentStatus) {
    setBusy(true);
    setError(null);
    try {
      const reply = await updateExperiment({ data: { id: record.id, status } });
      if (reply.ok && reply.experiment) upsert(reply.experiment);
      else setError(reply.ok ? "That change did not stick — try again." : "Something blocked the update. Try again.");
    } catch {
      setError("Something blocked the update. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function onSave(id: string, patch: { outcome: string; learning: string }) {
    setBusy(true);
    setError(null);
    try {
      const reply = await updateExperiment({ data: { id, outcome: patch.outcome, learning: patch.learning } });
      if (reply.ok && reply.experiment) upsert(reply.experiment);
      else setError(reply.ok ? "That change did not stick — try again." : "Something blocked the update. Try again.");
    } catch {
      setError("Something blocked the update. Check your connection and try again.");
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

  const ordered = [...list].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  const finished = list.filter((record) => record.status === "done" || record.status === "dropped");
  const learnings = finished.filter((record) => (record.learning ?? "").trim().length > 0);
  const duplicate = similarPastExperiment(form.title, finished);

  return (
    <div className="container-site py-8 sm:py-12">
      <PageHeader
        eyebrow="Coach tool"
        title="Experiment tracker"
        lead="An experiment without a number is an opinion. Give each test a hypothesis, a success metric and a failure threshold — then record what actually happened so you never re-run a question you have already answered."
        right={<CoachMeta brain={state.brain} plan={state.plan} />}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {error ? <ErrorNotice message={error} /> : null}

          <section className="card p-5 sm:p-6">
            <CardHead
              eyebrow="New experiment"
              title="Design the test"
              icon="flask"
              right={
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm((open) => !open)}>
                  {showForm ? "Close" : "New experiment"}
                </button>
              }
            />
            {!showForm ? (
              <p className="mt-3 text-[13px] text-fg-muted">
                {list.length === 0
                  ? "No experiments yet. Start with a test you can finish in a week."
                  : `${list.length} tracked. Add the next test when you are ready.`}
              </p>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={onSubmit}>
                <Field label="Title" htmlFor="exp-title">
                  <input
                    id="exp-title"
                    className="input"
                    value={form.title}
                    onChange={(event) => set("title", event.target.value)}
                    placeholder="Cold-email 50 clinic managers"
                    maxLength={200}
                    required
                  />
                </Field>
                {duplicate ? (
                  <p className="rounded-md border border-line bg-raised px-3.5 py-2.5 text-[12px] text-fg-muted">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-warn uppercase">Careful · </span>
                    you already ran &ldquo;{duplicate.title}&rdquo;
                    {duplicate.learning ? ` — learning: ${duplicate.learning}` : ""}. Only re-run it with a different
                    number or a different channel.
                  </p>
                ) : null}
                <Field
                  label="Hypothesis"
                  htmlFor="exp-hypothesis"
                  hint="If … then … because … — one sentence you can be wrong about."
                >
                  <textarea
                    id="exp-hypothesis"
                    className="input min-h-[80px]"
                    value={form.hypothesis}
                    onChange={(event) => set("hypothesis", event.target.value)}
                    placeholder="If I email 50 clinic managers a compliance reminder, 5 will book a call."
                    maxLength={1200}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Expected result" htmlFor="exp-expected">
                    <input
                      id="exp-expected"
                      className="input"
                      value={form.expectedResult}
                      onChange={(event) => set("expectedResult", event.target.value)}
                      placeholder="5 booked calls"
                      maxLength={600}
                    />
                  </Field>
                  <Field label="Success metric" htmlFor="exp-metric" hint="The number the dashboard will show.">
                    <input
                      id="exp-metric"
                      className="input"
                      value={form.metric}
                      onChange={(event) => set("metric", event.target.value)}
                      placeholder="Reply rate %"
                      maxLength={300}
                    />
                  </Field>
                  <Field label="Failure threshold" htmlFor="exp-fail" hint="The number that means stop, not try harder.">
                    <input
                      id="exp-fail"
                      className="input"
                      value={form.failureThreshold}
                      onChange={(event) => set("failureThreshold", event.target.value)}
                      placeholder="Fewer than 2 replies in 2 weeks"
                      maxLength={600}
                    />
                  </Field>
                  <Field label="Cost" htmlFor="exp-cost">
                    <input
                      id="exp-cost"
                      className="input"
                      value={form.cost}
                      onChange={(event) => set("cost", event.target.value)}
                      placeholder="$0"
                      maxLength={120}
                    />
                  </Field>
                  <Field label="Time required" htmlFor="exp-time">
                    <input
                      id="exp-time"
                      className="input"
                      value={form.timeRequired}
                      onChange={(event) => set("timeRequired", event.target.value)}
                      placeholder="3 hours over 2 weeks"
                      maxLength={120}
                    />
                  </Field>
                  <Field label="Status" htmlFor="exp-status">
                    <select
                      id="exp-status"
                      className="input"
                      value={form.status}
                      onChange={(event) => set("status", event.target.value as ExperimentStatus)}
                    >
                      <option value="proposed">Proposed — not started</option>
                      <option value="running">Running — starts today</option>
                      <option value="done">Done — recording a finished test</option>
                      <option value="dropped">Dropped — abandoned</option>
                    </select>
                  </Field>
                  <Field label="Start date" htmlFor="exp-start">
                    <input
                      id="exp-start"
                      type="date"
                      className="input"
                      value={form.startedAt}
                      onChange={(event) => set("startedAt", event.target.value)}
                    />
                  </Field>
                  <Field label="End date" htmlFor="exp-end">
                    <input
                      id="exp-end"
                      type="date"
                      className="input"
                      value={form.endedAt}
                      onChange={(event) => set("endedAt", event.target.value)}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-fg-faint">
                    Running experiments appear on the dashboard&rsquo;s experiments card.
                  </p>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? (
                      <>
                        <Icon name="spinner" className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                        Create experiment
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </section>

          {ordered.length === 0 ? (
            <EmptyState
              icon="flask"
              title="No experiments yet"
              body="Start with the cheapest test that would change your mind. One hypothesis, one number, one deadline."
              action={
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                  Design the first experiment
                </button>
              }
            />
          ) : (
            <ul className="space-y-4">
              {ordered.map((record) => (
                <ExperimentCard
                  key={record.id}
                  record={record}
                  busy={busy}
                  onStatus={onStatus}
                  onSave={onSave}
                />
              ))}
            </ul>
          )}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="card p-4">
            <CardHead eyebrow="Scoreboard" title="By status" icon="gauge" />
            <ul className="mt-3 space-y-2">
              {STATUS_ORDER.map((status) => (
                <li key={status} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2">
                  <StatusBadge status={status} />
                  <span className="font-mono text-[13px] tabular-nums">{list.filter((record) => record.status === status).length}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <CardHead eyebrow="History" title={`Past learnings (${learnings.length})`} icon="clipboard" />
            {learnings.length === 0 ? (
              <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
                Nothing finished yet. Once you record an outcome and a learning, it lands here — the record that stops
                the business re-running a settled question.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {learnings.map((record) => (
                  <li key={record.id} className="rounded-md border border-line bg-surface p-3">
                    <p className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[12.5px] font-medium">{record.title}</span>
                      <StatusBadge status={record.status} />
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">{record.learning}</p>
                    {record.outcome ? (
                      <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-fg-faint uppercase">
                        {record.outcome.length > 80 ? `${record.outcome.slice(0, 80)}…` : record.outcome}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <p className="eyebrow">The loop</p>
            <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">
              A finished experiment feeds tomorrow&rsquo;s priorities: the coach reads what you learned and stops
              proposing tests you already ran.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
