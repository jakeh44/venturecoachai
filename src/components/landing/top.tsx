import { useState } from "react";
import { Wordmark } from "~/components/brand";
import { Icon, type IconName } from "~/components/icons";
import { ThemeToggle } from "~/components/theme-toggle";

/* ============================== NAV ====================================== */

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="nav-glass sticky top-0 z-50">
      <div className="container-site flex h-16 items-center justify-between gap-4">
        <a href="/" aria-label="VentureCoach AI home">
          <Wordmark />
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {[
            ["Method", "#method"],
            ["Roadmap", "#roadmap"],
            ["Features", "#features"],
            ["Pricing", "#pricing"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-sm px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <a href="/login" className="btn btn-ghost btn-sm">
            Log in
          </a>
          <a href="/signup" className="btn btn-primary btn-sm">
            Start free
          </a>
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="btn-ghost inline-flex h-9 w-9 items-center justify-center rounded-sm"
          >
            <Icon name={open ? "x" : "menu"} className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-canvas md:hidden">
          <nav className="container-site flex flex-col gap-1 py-4" aria-label="Mobile">
            {[
              ["Method", "#method"],
              ["Roadmap", "#roadmap"],
              ["Features", "#features"],
              ["Pricing", "#pricing"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-sm px-3 py-2.5 text-[15px] font-medium text-fg-muted hover:bg-raised hover:text-fg"
              >
                {label}
              </a>
            ))}
            <a href="/signup" className="btn btn-primary mt-2 w-full">
              Start free
            </a>
            <a href="/login" className="btn btn-secondary w-full">
              Log in
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

/* ============================== HERO ===================================== */

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0" aria-hidden />
      <div
        className="absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(560px 300px at 50% -60px, var(--vc-halo), transparent 72%)",
        }}
        aria-hidden
      />
      <div className="container-site relative pt-20 pb-16 text-center sm:pt-28 sm:pb-20">
        <span className="badge animate-rise mx-auto">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse-soft" />
          The coached loop: Decision → Action → Metric
        </span>

        <h1
          className="animate-rise mx-auto mt-6 max-w-3xl text-4xl leading-[1.05] font-bold sm:text-6xl"
          style={{ animationDelay: "60ms" }}
        >
          Your business, run like an <span className="text-gradient">operating system</span>
          <span className="text-fg-faint">.</span>
        </h1>

        <p
          className="animate-rise mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-fg-muted sm:text-xl"
          style={{ animationDelay: "120ms" }}
        >
          VentureCoach AI is a guided business operating system, not a chatbot. It tells you what
          matters today, forces one bottleneck at a time, and ends every session with a decision,
          an action, and a metric.
        </p>

        <div
          className="animate-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "180ms" }}
        >
          <a href="/signup" className="btn btn-primary btn-lg w-full sm:w-auto">
            Start free
            <Icon name="arrow-right" className="h-4 w-4" strokeWidth={2} />
          </a>
          <a href="#pricing" className="btn btn-secondary btn-lg w-full sm:w-auto">
            See pricing
          </a>
        </div>
        <p className="mt-4 text-[13px] text-fg-faint">Free plan. No credit card. One business.</p>

        <CoachedLoop />
      </div>
    </section>
  );
}

/* The coached loop: Decision → Action → Metric → Feedback, rendered as a
   pipeline with an animated token traveling the track. */
function CoachedLoop() {
  const steps: { icon: IconName; label: string }[] = [
    { icon: "git-branch", label: "Decision" },
    { icon: "bolt", label: "Action" },
    { icon: "gauge", label: "Metric" },
    { icon: "loop", label: "Feedback" },
  ];

  return (
    <div
      className="animate-rise card relative mx-auto mt-14 max-w-3xl px-6 py-7 sm:px-10"
      style={{ animationDelay: "260ms" }}
    >
      <div className="pointer-events-none absolute inset-x-10 top-[50px] h-2 -translate-y-1/2" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <span className="animate-loop-dot absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent-400 shadow-glow" />
      </div>
      <div className="relative grid grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-col items-center gap-2.5">
            <span className="bg-surface text-brand-600 dark:text-brand-300 flex h-11 w-11 items-center justify-center rounded-md border border-line shadow-card">
              <Icon name={s.icon} className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-fg-muted uppercase sm:text-[11px]">
              {s.label}
            </span>
            <span className="sr-only">{`${i + 1} of 4`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========================== TRUST STRIP ================================== */

export function TrustStrip() {
  const notes = [
    "Founders use VentureCoach to ship decisions",
    "Built on validation-first coaching",
    "One bottleneck at a time",
    "Every session ends in a metric",
  ];
  return (
    <section className="hairline-t">
      <div className="container-site flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-6">
        {notes.map((n) => (
          <span key={n} className="flex items-center gap-2 text-[13px] text-fg-faint">
            <Icon name="check" className="h-3.5 w-3.5 text-accent-500" strokeWidth={2.4} />
            {n}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ============================= SECTION HEAD ============================== */

export function SectionHead({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h2>
      {sub && <p className="mt-4 text-base leading-relaxed text-fg-muted">{sub}</p>}
    </div>
  );
}

/* ============================= PROBLEM ================================== */

const CHAOS = [
  { icon: "spinner", text: "Drowning in advice — gurus, threads, and courses all pulling in different directions" },
  { icon: "layers", text: "Twenty ideas half-started, none validated" },
  { icon: "target", text: "No idea which metric actually matters this week" },
  { icon: "flask", text: "Building before anyone would pay" },
] as const;

export function Problem() {
  return (
    <section className="section" id="problem">
      <div className="container-site grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <SectionHead
          align="left"
          eyebrow="The real problem"
          title="Founders don't fail from lack of effort. They fail from lack of prioritization."
          sub="You don't need another answer machine. You need something that decides what deserves your attention — and holds you to it."
        />
        <ul className="flex flex-col gap-3">
          {CHAOS.map((c) => (
            <li key={c.text} className="card flex items-start gap-3.5 p-4">
              <span className="text-risk/90 mt-0.5 shrink-0">
                <Icon name={c.icon} className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="text-[15px] leading-relaxed text-fg-muted">{c.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ============================ PHILOSOPHY ================================= */

const PRINCIPLES: { icon: IconName; title: string; body: string }[] = [
  { icon: "flask", title: "Validate before building", body: "Evidence from real buyers beats taste. Every idea gets a cheap test before it gets an hour of build time." },
  { icon: "crosshair", title: "One bottleneck at a time", body: "There's always exactly one constraint. Find it, work it, and let the rest wait." },
  { icon: "target", title: "High-leverage priorities", body: "Three priorities a day, not thirty. If everything is important, nothing moves." },
  { icon: "scan-search", title: "Evidence over opinions", body: "Coaching grounded in your numbers and customer conversations — never vibes." },
  { icon: "clipboard", title: "Run experiments, not campaigns", body: "A weekly experiment with a hypothesis, a budget, and a kill criteria." },
  { icon: "git-branch", title: "Systems over heroics", body: "What repeats gets documented and delegated. You scale the machine, not your hours." },
  { icon: "gauge", title: "Numbers that matter", body: "A handful of metrics tied to the current stage. Ignore the vanity dashboard." },
  { icon: "loop", title: "Decisions close loops", body: "Every session ends with a decision, an action, and a metric — then the loop reports back." },
];

export function Philosophy() {
  return (
    <section className="section" id="method">
      <div className="container-site">
        <SectionHead
          eyebrow="Coaching philosophy"
          title="A method, not a mood"
          sub="Seven principles drive every recommendation VentureCoach AI gives you. They're the difference between a coach and a chatbot."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="card card-hover p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-raised text-brand-600 dark:text-brand-300">
                <Icon name={p.icon} className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================= ROADMAP =================================== */

const STAGES = [
  "Find", "Validate", "Offer", "Sell", "Deliver",
  "Systemize", "Scale", "Optimize", "Delegate", "Exit",
] as const;

export function Roadmap() {
  return (
    <section className="section" id="roadmap">
      <div className="container-site">
        <SectionHead
          eyebrow="The roadmap"
          title="Ten stages. One at a time."
          sub="Your business lives at exactly one stage. The coach adjusts priorities, metrics, and experiments to that stage — never generic advice."
        />

        {/* Mobile/tablet: compact list. md+: connected strip — below md the ten
            stage labels collide with each other. */}
        <ol className="mt-12 grid grid-cols-1 gap-2 md:hidden">
          {STAGES.map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
              <span className="font-mono text-[11px] font-medium text-fg-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-sm font-medium">{s}</span>
            </li>
          ))}
        </ol>

        <div className="mt-12 hidden md:block">
          <div className="relative">
            <div className="absolute top-[13px] right-[7%] left-[7%] h-px bg-line" aria-hidden />
            <ol className="relative grid grid-cols-10">
              {STAGES.map((s, i) => {
                const current = i === 2; /* teaser: an account sitting at "Offer" */
                return (
                  <li key={s} className="flex flex-col items-center gap-3">
                    <span
                      className={
                        "flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[10px] font-semibold " +
                        (current
                          ? "border-brand-500 bg-brand-600 text-white shadow-btn-primary"
                          : "border-line-strong bg-surface text-fg-muted")
                      }
                    >
                      {i + 1}
                    </span>
                    <span
                      className={
                        "font-mono text-[9px] tracking-[0.06em] uppercase xl:text-[11px] xl:tracking-[0.12em] " +
                        (current ? "font-semibold text-brand-600 dark:text-brand-300" : "text-fg-faint")
                      }
                    >
                      {s}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="card mx-auto mt-10 flex max-w-xl items-center justify-center gap-3 px-6 py-4 text-center">
            <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse-soft" aria-hidden />
            <p className="text-sm text-fg-muted">
              Example account: <span className="font-medium text-fg">Stage 3 — Offer.</span> Today's priorities:{" "}
              <span className="font-medium text-fg">price test, 5 discovery calls, landing offer copy.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
