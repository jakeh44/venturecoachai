import { Icon, type IconName } from "~/components/icons";
import { Wordmark } from "~/components/brand";
import { SectionHead } from "~/components/landing/top";

/* ============================= FEATURES ================================== */

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "calendar", title: "Daily coach", body: "Opens every morning with your top three priorities — the three things that actually move the constraint." },
  { icon: "message", title: "Weekly coach", body: "One objective for the week, three priorities, one experiment. Reviewed against last week's evidence." },
  { icon: "scan-search", title: "Business Idea Analyzer", body: "Scores your idea 1–10 by category, splits what you know from what you assume, and hands you a validation plan." },
  { icon: "git-branch", title: "Decision Engine", body: "A 14-step walkthrough for big calls — options, evidence, and a decision you can defend later." },
  { icon: "crosshair", title: "Find the Constraint", body: "Diagnoses the one bottleneck limiting your business right now and points every priority at it." },
  { icon: "flask", title: "Experiment tracker", body: "Hypothesis, budget, deadline, and kill criteria for every bet. Evidence, not opinions." },
  { icon: "user", title: "Founder profile + business memory", body: "Your business, stage, and history persist. You never re-explain yourself to your coach." },
  { icon: "gauge", title: "Health scorecard", body: "A live score across the numbers that matter at your stage — not a vanity dashboard." },
];

export function Features() {
  return (
    <section className="section" id="features">
      <div className="container-site">
        <SectionHead
          eyebrow="What's inside"
          title="A coach with a system, not a chat window"
          sub="Each tool feeds the same business memory, so every recommendation gets sharper the longer you work."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-raised text-brand-600 dark:text-brand-300">
                <Icon name={f.icon} className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================== PRICING ================================== */

type Tier = {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
  popular?: boolean;
  features: { label: string; soon?: boolean }[];
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Get oriented. See what a coached week feels like.",
    cta: "Start free",
    features: [
      { label: "Basic coaching" },
      { label: "One business" },
      { label: "Limited analyses" },
      { label: "Basic roadmap" },
    ],
  },
  {
    name: "Pro",
    price: "$29",
    cadence: "per month",
    blurb: "The full operating system for one business.",
    cta: "Start with Pro",
    popular: true,
    features: [
      { label: "Unlimited coaching" },
      { label: "Business Idea Analyzer" },
      { label: "Decision Engine" },
      { label: "Customer Discovery", soon: true },
      { label: "Offer Builder", soon: true },
      { label: "Financial model", soon: true },
      { label: "Experiments" },
      { label: "Business memory" },
    ],
  },
  {
    name: "Elite",
    price: "$99",
    cadence: "per month",
    blurb: "A coach in the room for every big call.",
    cta: "Go Elite",
    features: [
      { label: "Everything in Pro" },
      { label: "Advanced analysis" },
      { label: "Advanced financials", soon: true },
      { label: "Weekly strategic review" },
      { label: "Priority coaching" },
      { label: "Multiple businesses", soon: true },
      { label: "Advanced analytics", soon: true },
    ],
  },
];

export function Pricing() {
  return (
    <section className="section" id="pricing">
      <div className="container-site">
        <SectionHead
          eyebrow="Pricing"
          title="Start free. Upgrade when it's earning its keep."
          sub="Every plan includes the coached loop — decisions, actions, and metrics. Prices are per business."
        />

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-3 lg:gap-5">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={
                t.popular
                  ? "relative rounded-xl border border-brand-500/60 bg-surface shadow-pop"
                  : "card relative"
              }
            >
              {t.popular && (
                <>
                  <div
                    className="pointer-events-none absolute inset-0 rounded-xl"
                    style={{ boxShadow: "inset 0 1px 0 0 rgb(255 255 255 / 0.06), 0 0 64px -18px rgb(94 98 244 / 0.5)" }}
                    aria-hidden
                  />
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-white uppercase shadow-btn-primary">
                    Most popular
                  </span>
                </>
              )}

              <div className="flex h-full flex-col p-6 sm:p-7">
                <h3 className="font-display text-lg font-semibold">{t.name}</h3>
                <p className="mt-1 text-sm text-fg-muted">{t.blurb}</p>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-bold tracking-tight">{t.price}</span>
                  <span className="text-sm text-fg-faint">{t.cadence}</span>
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {t.features.map((f) => (
                    <li key={t.name + f.label} className="flex items-start gap-2.5 text-sm">
                      {f.soon ? (
                        <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-line text-center font-mono text-[8px] font-semibold leading-4 text-fg-faint" aria-hidden>
                          ↻
                        </span>
                      ) : (
                        <Icon
                          name="check"
                          className={t.popular ? "mt-0.5 h-4 w-4 shrink-0 text-accent-400" : "mt-0.5 h-4 w-4 shrink-0 text-accent-500"}
                          strokeWidth={2.2}
                        />
                      )}
                      <span className="text-fg-muted">
                        {f.label}
                        {f.soon && (
                          <span className="ml-1.5 rounded-sm border border-line bg-sunken px-1 py-px font-mono text-[9px] font-medium tracking-[0.08em] text-fg-faint uppercase">
                            Soon
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href="/signup"
                  className={`btn mt-7 w-full ${t.popular ? "btn-primary" : "btn-secondary"}`}
                >
                  {t.cta}
                </a>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-[13px] text-fg-faint">
          Prices in USD. Change or cancel anytime from your account.
        </p>
      </div>
    </section>
  );
}

/* ============================= FINAL CTA ================================= */

export function FinalCta() {
  return (
    <section className="section">
      <div className="container-site">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-surface px-6 py-16 text-center sm:px-12">
          <div className="bg-grid absolute inset-0" aria-hidden />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(520px 260px at 50% 0%, var(--vc-halo), transparent 70%)",
            }}
            aria-hidden
          />
          <div className="relative">
            <h2 className="mx-auto max-w-xl text-3xl font-bold sm:text-4xl">
              Stop collecting advice. Start shipping{" "}
              <span className="text-gradient">decisions</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base text-fg-muted">
              Your first coached session takes five minutes. The Free plan has no time limit.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="/signup" className="btn btn-primary btn-lg w-full sm:w-auto">
                Start free
                <Icon name="arrow-right" className="h-4 w-4" strokeWidth={2} />
              </a>
              <a href="#pricing" className="btn btn-secondary btn-lg w-full sm:w-auto">
                See pricing
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =============================== FOOTER ================================== */

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="hairline-t">
      <div className="container-site flex flex-col items-center justify-between gap-6 py-10 sm:flex-row">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Wordmark markClassName="h-6 w-6" className="scale-90" />
          <p className="text-[13px] text-fg-faint">
            The guided business operating system. Decision → Action → Metric.
          </p>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-fg-muted" aria-label="Footer">
          <a href="#method" className="transition-colors hover:text-fg">Method</a>
          <a href="#roadmap" className="transition-colors hover:text-fg">Roadmap</a>
          <a href="#features" className="transition-colors hover:text-fg">Features</a>
          <a href="#pricing" className="transition-colors hover:text-fg">Pricing</a>
          <a href="/signup" className="transition-colors hover:text-fg">Sign up</a>
        </nav>

        <p className="text-[13px] text-fg-faint">© {year} VentureCoach AI</p>
      </div>
    </footer>
  );
}
