import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * The database driver (postgres.js) is a TCP client built on node:net/tls. Server
 * functions never ship to the browser, but TanStack Start's client build still
 * resolves the import graph down to `~/db`, where Vite's client environment
 * refuses node builtins and fails the whole build. This plugin resolves
 * `postgres` to a throwing stub for the client environment only — the server
 * build (and every runtime query) keeps the real driver. See
 * src/db.browser-stub.ts.
 *
 * (A `resolve.alias`, even scoped to `environments.client.resolve`, is not
 * enough here: the start plugin builds the client environment with its own
 * resolved options. A `pre` resolveId hook runs before `vite:resolve` and sees
 * which environment it is resolving for.)
 */
function browserPostgresStub(): Plugin {
  const stub = path.resolve(import.meta.dirname, "src/db.browser-stub.ts");
  return {
    name: "venturecoach:browser-postgres-stub",
    enforce: "pre",
    resolveId(source) {
      const consumer = this.environment?.config?.consumer;
      if (source === "postgres" && consumer === "client") return stub;
      return null;
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
    host: true,
    // The site is reverse-proxied behind <label>.<PUBLIC_SITE_DOMAIN>; the proxy
    // masks the Host to localhost:3000, but accept any host so a dev server never
    // rejects a proxied request with "Blocked request".
    allowedHosts: true,
    // The dev server is reachable through the TLS proxy, so the HMR websocket
    // must dial back on 443, not the dev port. If the socket can't connect,
    // pages still serve — hot reload degrades, never breaks.
    hmr: { clientPort: 443 },
    // The dev server can serve source files; never let it serve local secrets,
    // and never let it serve anything outside the site dir. Gotchas this list
    // encodes: a custom `deny` REPLACES Vite's defaults (so .git must be
    // restated), patterns containing "/" match the ABSOLUTE path (so dir
    // patterns need a leading **/), and `allow` left to its default widens to
    // the nearest workspace root — a stray .git or workspaces package.json in
    // /home/team/shared would expose the whole shared dir.
    fs: {
      strict: true,
      allow: [import.meta.dirname],
      deny: [".env", ".env.*", "*.{crt,pem,key}", "**/.run/**", "**/.git/**"],
    },
  },
  plugins: [
    browserPostgresStub(),
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      // Safety net: server-only modules (anything importing
      // `@tanstack/react-start/server`) are mocked to empty stubs in the client
      // build instead of leaking Node builtins into the browser bundle.
      importProtection: {
        enabled: true,
        behavior: "mock",
      },
    }),
    viteReact(),
  ],
});
