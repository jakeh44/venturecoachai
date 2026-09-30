import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authStatus, login } from "~/server/auth/server";
import { Wordmark } from "~/components/brand";
import { Icon } from "~/components/icons";

export const Route = createFileRoute("/login")({
  // `next` comes from the protected layout's redirect: /login?next=/dashboard
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" && search.next.startsWith("/") ? search.next : undefined,
  }),
  loader: async () => ({ db: (await authStatus()).db }),
  component: Login,
});

/** Login — same design tokens as signup (.card, .label, .input, .btn). */
function Login() {
  const { db } = Route.useLoaderData();
  const { next } = Route.useSearch();
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
      const result = await login({
        data: {
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        },
      });
      if (result.ok) {
        await router.navigate({ to: next ?? "/dashboard" });
        return;
      }
      setError(
        result.reason === "setup"
          ? "Accounts are being set up — check back soon."
          : "Invalid email or password.",
      );
    } catch {
      // Never leave the submit button stuck on "Logging in…".
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
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Log in to continue your coached sessions.
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
                <label htmlFor="li-email" className="label">
                  Email
                </label>
                <input id="li-email" name="email" type="email" required className="input" placeholder="you@company.com" autoComplete="email" />
              </div>
              <div>
                <label htmlFor="li-password" className="label">
                  Password
                </label>
                <input id="li-password" name="password" type="password" required className="input" placeholder="••••••••" autoComplete="current-password" />
              </div>
              <button type="submit" disabled={busy} className="btn btn-primary btn-lg mt-2 w-full disabled:opacity-60">
                {busy ? "Logging in…" : "Log in"}
                {!busy && <Icon name="arrow-right" className="h-4 w-4" strokeWidth={2} />}
              </button>
            </form>
          )}
        </div>
        <p className="mt-6 text-sm text-fg-faint">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
            Start free
          </a>
        </p>
      </div>
    </main>
  );
}