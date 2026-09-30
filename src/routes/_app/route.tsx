import { createFileRoute, Link, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { requireUser } from "~/server/auth/server";
import { PLAN_LABELS } from "~/server/plans";
import { Wordmark } from "~/components/brand";
import { ThemeToggle } from "~/components/theme-toggle";
import { Icon } from "~/components/icons";

/**
 * Authed app shell — pathless layout for everything under /dashboard.
 * beforeLoad calls requireUser() (server fn) and redirects to /login?next=
 * when there's no session, exactly per the settled verdict: the redirect is
 * thrown here in beforeLoad, never inside the server fn.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const user = await requireUser();
    if (!user) {
      throw redirect({ to: "/login", search: { next: "/dashboard" } });
    }
    return { user };
  },
  component: AppShell,
});

type IconName = Parameters<typeof Icon>[0]["name"];

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Shipped tools link; later-phase tools render as "Soon". */
  soon?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "gauge" },
  { label: "Onboarding", href: "/onboarding", icon: "user" },
];

const TOOL_NAV: NavItem[] = [
  { label: "Idea Analyzer", href: "/idea-analyzer", icon: "crosshair" },
  { label: "Decision Engine", href: "/decision-engine", icon: "git-branch" },
  { label: "Experiments", href: "/experiments", icon: "flask" },
  { label: "Customers", href: "/tools/customers", icon: "message", soon: true },
  { label: "Financials", href: "/tools/financials", icon: "layers", soon: true },
  { label: "Journal", href: "/tools/journal", icon: "clipboard", soon: true },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const className =
    "relative flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors " +
    (active
      ? "bg-raised font-medium text-fg"
      : item.soon
        ? "text-fg-faint"
        : "text-fg-muted hover:bg-raised hover:text-fg");

  const body = (
    <>
      {active ? (
        <span className="absolute top-1.5 bottom-1.5 -left-2 w-0.5 rounded-full bg-brand-500" aria-hidden />
      ) : null}
      <Icon name={item.icon} className="h-4 w-4 shrink-0" strokeWidth={1.9} />
      <span className="truncate">{item.label}</span>
      {item.soon ? (
        <span className="ml-auto font-mono text-[9px] tracking-[0.14em] text-fg-faint uppercase">
          soon
        </span>
      ) : null}
    </>
  );

  if (item.soon) {
    return (
      <span
        className={className}
        aria-disabled="true"
        aria-label={`${item.label} — coming soon`}
        title={`${item.label} ships in a later phase`}
      >
        {body}
      </span>
    );
  }

  return (
    <Link to={item.href} className={className}>
      {body}
    </Link>
  );
}

function AppShell() {
  const { user } = Route.useRouteContext();
  const planLabel = PLAN_LABELS[user.plan as keyof typeof PLAN_LABELS] ?? user.plan;
  const pathname = useLocation({ select: (location) => location.pathname });
  const all = [...PRIMARY_NAV, ...TOOL_NAV];

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="nav-glass sticky top-0 z-20">
        {/* Same max width + gutters as the body row below, so the wordmark,
            the sidebar and the filter strip all sit on one vertical grid. */}
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex items-center gap-5">
            <a href="/" aria-label="VentureCoach AI home">
              <Wordmark markClassName="h-7 w-7" />
            </a>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={
                    "rounded-sm px-3 py-1.5 text-sm transition-colors " +
                    (pathname === item.href
                      ? "bg-raised font-medium text-fg"
                      : "text-fg-muted hover:bg-raised hover:text-fg")
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="badge hidden sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
              {planLabel} plan
            </span>
            <ThemeToggle />
            <span
              className="hidden max-w-[160px] truncate text-sm text-fg-muted lg:block"
              title={user.email ?? undefined}
            >
              {user.name ?? user.email}
            </span>
            <a href="/logout" className="btn btn-ghost btn-sm" aria-label="Log out" title="Log out">
              Log out
            </a>
          </div>
        </div>
      </header>

      {/* Mobile/tablet tool nav: the sidebar collapses into a horizontally
          scrollable strip. */}
      <nav className="hairline-t lg:hidden" aria-label="Tools">
        <div className="mx-auto flex w-full max-w-[1400px] gap-1 overflow-x-auto px-5 py-2 sm:px-6">
          {all.map((item) => {
            const className =
              "flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] " +
              (pathname === item.href
                ? "bg-raised font-medium text-fg"
                : item.soon
                  ? "text-fg-faint"
                  : "text-fg-muted");
            const body = (
              <>
                <Icon name={item.icon} className="h-3.5 w-3.5" strokeWidth={1.9} />
                {item.label}
              </>
            );
            return item.soon ? (
              <span
                key={item.href}
                className={className}
                aria-disabled="true"
                title={`${item.label} ships in a later phase`}
              >
                {body}
              </span>
            ) : (
              <Link key={item.href} to={item.href} className={className}>
                {body}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-8 px-5 sm:px-6">
        <aside className="hidden w-52 shrink-0 py-8 lg:block">
          <nav className="sticky top-24 flex flex-col gap-1" aria-label="Tools">
            {PRIMARY_NAV.map((item) => (
              <NavRow key={item.href} item={item} active={pathname === item.href} />
            ))}
            <p className="mt-5 mb-1 px-3 font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
              Coach tools
            </p>
            {TOOL_NAV.map((item) => (
              <NavRow key={item.href} item={item} active={false} />
            ))}
            <p className="mt-5 rounded-md border border-line bg-surface p-3 text-[12px] leading-relaxed text-fg-faint">
              Every session ends with a decision, an action and a metric.
            </p>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
