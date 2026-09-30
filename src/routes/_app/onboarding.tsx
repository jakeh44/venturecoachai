import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { getOnboardingState, submitOnboarding } from "~/server/onboarding/server";
import type { OnboardingState } from "~/server/onboarding/server";
import { ONBOARDING_QUESTIONS } from "~/server/onboarding/questions";
import { Icon } from "~/components/icons";

export const Route = createFileRoute("/_app/onboarding")({
  loader: async (): Promise<OnboardingState> => await getOnboardingState(),
  component: Onboarding,
});

/** Honest fallback so the wizard renders before/without loader data. */
const EMPTY_STATE: OnboardingState = {
  setup: false,
  hasBusiness: false,
  founderName: null,
  answers: {},
  completed: false,
};

/**
 * The 17-question founder intake.
 *
 * One question per step, exact slugs/questions from PRODUCT-CONSTANTS.md.
 * Answers are kept client-side until the final step, then written in one server
 * call that also creates the business and seeds stage detection + the first
 * constraint. After that the coach never asks these questions again.
 */
function Onboarding() {
  const state: OnboardingState = Route.useLoaderData() ?? EMPTY_STATE;
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(state.answers ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = ONBOARDING_QUESTIONS.length;
  const question = ONBOARDING_QUESTIONS[index];
  const value = values[question.slug] ?? "";
  const answered = useMemo(
    () => ONBOARDING_QUESTIONS.filter((entry) => (values[entry.slug] ?? "").trim().length > 0).length,
    [values],
  );
  const isLast = index === total - 1;
  const canContinue = value.trim().length > 0;
  const percent = Math.round(((index + (canContinue ? 1 : 0)) / total) * 100);

  function set(value: string) {
    setValues((previous) => ({ ...previous, [question.slug]: value }));
  }

  function next() {
    if (!canContinue) return;
    setError(null);
    if (!isLast) {
      setIndex((current) => Math.min(current + 1, total - 1));
      return;
    }
    void submit();
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitOnboarding({ data: { answers: values } });
      if (result.ok) {
        await router.navigate({ to: "/dashboard" });
        return;
      }
      setError(
        result.reason === "setup"
          ? "Accounts are being set up — check back soon."
          : result.reason === "unauthorized"
            ? "Your session expired. Log in again to continue."
            : (result.message ?? "Please answer the questions before continuing."),
      );
    } catch {
      // Never leave the wizard stuck on "Building your plan…" — your answers stay.
      setError("We could not save that just now. Your answers are still here — try again.");
    }
    setBusy(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    next();
  }

  if (state.setup) {
    return (
      <div className="container-site py-12">
        <div className="card bg-grid p-8 text-center">
          <Icon name="spark" className="mx-auto h-6 w-6 text-brand-500" strokeWidth={2.2} />
          <h1 className="mt-4 text-xl font-bold">Onboarding is being wired up</h1>
          <p className="mt-2 text-sm text-fg-muted">
            The team is connecting the coaching database. Everything else is live.
          </p>
          <a href="/dashboard" className="btn btn-secondary btn-sm mt-6 inline-flex">
            Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container-site py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Founder intake</p>
            <h1 className="mt-2 text-xl font-bold sm:text-2xl">Let&rsquo;s build your coaching profile</h1>
          </div>
          <p className="font-mono text-xs text-fg-faint tabular-nums">
            {index + 1} / {total}
          </p>
        </div>

        {/* Progress: completed steps + the current one once it's answerable. */}
        <div
          className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index + (canContinue ? 1 : 0)}
          aria-valuetext={`Step ${index + 1} of ${total}`}
          aria-label="Onboarding progress"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        {state.completed ? (
          <p className="mt-4 rounded-md border border-line bg-raised px-3 py-2 text-[13px] text-fg-muted">
            You have already completed onboarding — answering again updates your business profile
            rather than creating a second one.
          </p>
        ) : null}

        <form className="card mt-5 p-6 sm:p-7" onSubmit={onSubmit} key={question.slug}>
          <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-fg-faint uppercase">
            {question.about === "founder" ? "About you" : "About the business"}
          </p>
          <h2 className="mt-2 text-lg font-semibold sm:text-xl">{question.question}</h2>
          <p className="mt-2 text-[13px] text-fg-muted">{question.hint}</p>

          <div className="mt-5">
            {question.kind === "choice" ? (
              <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.question}>
                {(question.choices ?? []).map((choice) => {
                  const selected = value === choice;
                  return (
                    <button
                      key={choice}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => set(choice)}
                      className={
                        "flex w-full items-center justify-between gap-3 rounded-md border px-3.5 py-3 text-left text-sm transition-colors " +
                        (selected
                          ? "border-brand-500 bg-halo text-fg"
                          : "border-line-strong bg-surface text-fg-muted hover:bg-raised hover:text-fg")
                      }
                    >
                      <span className="font-medium">{choice}</span>
                      {selected ? (
                        <Icon name="check" className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" strokeWidth={2.4} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : question.kind === "textarea" ? (
              <textarea
                className="input min-h-[104px] resize-y py-2.5 leading-relaxed"
                value={value}
                onChange={(event) => set(event.target.value)}
                placeholder={question.placeholder}
                rows={4}
                autoFocus
              />
            ) : (
              <input
                className="input"
                value={value}
                onChange={(event) => set(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    next();
                  }
                }}
                placeholder={question.placeholder}
                autoComplete="off"
                autoFocus
              />
            )}
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-4 rounded-md border border-risk/30 bg-risk/5 px-3 py-2.5 text-sm text-risk"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setIndex((current) => Math.max(current - 1, 0))}
              disabled={index === 0}
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              <span className="hidden font-mono text-[11px] text-fg-faint sm:block">
                {answered} of {total} answered
              </span>
              <button type="submit" className="btn btn-primary" disabled={!canContinue || busy}>
                {busy ? "Building your plan…" : isLast ? "Build my coaching plan" : "Continue"}
                {!busy ? <Icon name="arrow-right" className="h-4 w-4" strokeWidth={2} /> : null}
              </button>
            </div>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-fg-faint">
          Your answers become your business memory — you never re-explain your business to the coach.
        </p>
      </div>
    </div>
  );
}
