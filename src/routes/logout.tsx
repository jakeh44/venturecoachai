import { createFileRoute, redirect } from "@tanstack/react-router";
import { logout } from "~/server/auth/server";

/**
 * /logout — destroys the session (server fn inside beforeLoad, so it runs in
 * the SSR request context and clears the cookie) and redirects home. Used by
 * the authed shell header via a plain <a href="/logout"> link.
 */
export const Route = createFileRoute("/logout")({
  beforeLoad: async () => {
    await logout();
    throw redirect({ to: "/" });
  },
  component: () => null,
});