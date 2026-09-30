/**
 * Browser-build stub for the `postgres` package.
 *
 * postgres.js is a wire-protocol TCP client: it imports `node:net`, `node:tls`,
 * `node:stream` and `node:perf_hooks`, none of which can exist in a browser
 * bundle. The database layer in `~/db` only ever runs inside a
 * `createServerFn()` handler or an `src/routes/api/*` route, but TanStack
 * Start's *client* build still walks the import graph down to it, and Vite's
 * client environment then tries to resolve those node builtins and fails the
 * build. `vite.config.ts` therefore aliases `postgres` to this module for the
 * client environment only — the server build keeps the real driver.
 *
 * Nothing the browser executes imports this file. If client code ever does call
 * `~/db` directly, the error below says exactly what went wrong.
 */

/** Replacement for the `postgres` default export in client builds. */
export default function postgresUnavailable(): never {
  throw new Error(
    "postgres.js is server-only — the database layer (~/db) cannot run in the browser. " +
      "Call it from a createServerFn handler or an src/routes/api/* route.",
  );
}
