import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Icon } from "~/components/icons";

/**
 * Pending state for awaited route data.
 *
 * Every authed page awaits a coach server fn (and the dashboard awaits several),
 * so a cold load can take a second or two. Without this the router renders an
 * empty document while the loader runs — the founder sees a blank screen with
 * no sign the app is working. Shows after 300ms so fast routes never flash it.
 */
function Pending() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6">
      <div className="w-full max-w-md space-y-3" aria-hidden>
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-7 w-3/4" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-5/6" />
        <div className="skeleton mt-6 h-24 w-full" />
      </div>
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-fg-faint uppercase"
      >
        <Icon name="spinner" className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
        Loading your coached session
      </p>
    </div>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPendingComponent: Pending,
    defaultPendingMs: 300,
    defaultPendingMinMs: 400,
    scrollRestoration: true,
    defaultNotFoundComponent: () => <p>Not found</p>,
  });
}
