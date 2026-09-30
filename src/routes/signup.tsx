import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authStatus, signup } from "~/server/auth/server";
import { Wordmark } from "~/components/brand";
import { Icon } from "~/components/icons";

export const Route = createFileRoute("/signup")({
  loader: async () => ({ db: (await authStatus()).db }),
  component: Signup,
});

/**
 * Signup — designer's styled shell, wired to the real signup server fn.
 * When the database isn't connected yet (dbAvailable() false) the form shows
 * the graceful setup banner and does not submit.
 */
function Signup() {
  const { db } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const result = await signup({
        data: {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        },
      });
      if (result.ok) {
        await router.navigate({ to: "/dashboard" });
        return;
      }
      if (result.reason === "setup") {
        setError("Accounts are being set up — check back soon.");
      } else if (result.reason === "exists") {
        setError("An account with that email already exists. Log in instead.");
      } else if (result.reason === "email") {
        setError("Enter a valid email address.");
      } else if (result.reason === "password") {
        setError("Password must be at least 8 characters.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      // Never leave the submit button stuck on "Creating account…".
      setError("We could not reach the coach just now. Please try again in a moment.");
    }
    setBusy(false);
  }

  return (
    <main className="relative flex min-h-dvh flex-col">
      <div className="bg-grid absolute inset-0" aria-hidden />
      <div
        className="absolute inset-x-0 top-0 h-[380px]"
        style={{
          background:
            "radial-gradient(560px 300px at 50% -60px, var(--vc-halo), transparent 72%)",
        }}
        aria-hidden
      />
      <div className="container-site relative flex flex-1 flex-col items-center justify-center py-16">
        <a href="/" aria-label="VentureCoach AI home" className="mb-10">
          <Wordmark markClassName="h-8 w-8" />
        </a>
        <div className="card w-full max-w-md p-7 sm:p-8">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Start on the Free plan. Your first coached session takes about five minutes.
          </p>
          {!db ? (
            <div className="mt-6 rounded-md border border-line bg-raised p-4 text-sm text-fg-muted">
              <span className="mb-2 flex items-center gap-2 font-medium text-fg">
                <Icon name="spark" className="h-4 w-4 text-brand-500" strokeWidth={2.4} />
                Accounts are being set up — check back soon.
              </span>
              <p className="mt-1">
                The team is wiring the database. The rest of the site is fully live.
              </p>
            </div>
          ) : (
            <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
              {error ? (
                <div
                  role="alert"
                  className="rounded-md border border-risk/30 bg-risk/5 px-3 py-2.5 text-sm text-risk"
                >
                  {error}
                </div>
              ) : null}
              <div>
                <label htmlFor="su-name" className="label">
                  Your name
                </label>
                <input id="su-name" name="name" className="input" placeholder="Ada Founder" autoComplete="name" />
              </div>
              <div>
                <label htmlFor="su-email" className="label">
                  Email
                </label>
                <input id="su-email" name="email" type="email" required className="input" placeholder="you@company.com" autoComplete="email" />
              </div>
              <div>
                <label htmlFor="su-password" className="label">
                  Password
                </label>
                <input id="su-password" name="password" type="password" required className="input" placeholder="••••••••" autoComplete="new-password" minLength={8} />
                <p className="mt-1.5 text-xs text-fg-faint">At least 8 characters.</p>
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-2 w-full disabled:opacity-60">
                {busy ? "Creating account…" : "Start free"}
                {!busy && <Icon name="arrow-right" className="h-4 w-4" strokeWidth={2} />}
              </button>
              <p className="text-center text-xs text-fg-faint">
                Free plan. No credit card. One business.
              </p>
            </form>
          )}
        </div>
        <p className="mt-6 text-sm text-fg-faint">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
            Log in
          </a>
        </p>
      </div>
    </main>
  );
}