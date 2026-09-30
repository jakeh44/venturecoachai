/**
 * Auth — server functions AND their server-only helpers, in one file.
 *
 * Why one file: TanStack Start's compiler rewrites files that *define*
 * createServerFn for the client build (handler bodies + their imports are
 * dropped, leaving RPC stubs). Helper modules imported *across* files (e.g.
 * a separate session.ts importing node:crypto) do NOT get that treatment and
 * leak Node builtins into the browser bundle — verified the hard way. So all
 * auth logic lives here, alongside the fns that use it.
 *
 * Contracts (team-settled verdicts):
 * - Handlers return plain JSON objects ONLY, never Response objects.
 * - Cookies are set inside handlers (setCookie), so the session cookie rides
 *   the signup/login response.
 * - requireUser() returns the user or null; the redirect is thrown from the
 *   protected layout's beforeLoad, never from inside a handler.
 * - Everything is guarded by dbAvailable(): without a DB the fns report
 *   `setup` and pages show the graceful banner.
 */
import * as nodeCrypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";
import { sql } from "~/db";
import { dbAvailable } from "../env";

/* ------------------------------------------------------------------ */
/* Password hashing (scrypt$N$r$p$salt$hash, timing-safe verify)      */
/* ------------------------------------------------------------------ */

const KEYLEN = 64;
const COST_N = 16384;
const COST_R = 8;
const COST_P = 1;

/** Dummy hash of a random password — verifies (slowly) but never matches. */
const DUMMY_HASH =
  "scrypt$16384$8$1$ZYlG3pYjIzz1tE7qDLyLzw==$tg140GnXtR/p9Py+BClwSl0yAKavMErvoqROdjqmhEnV9by8w3dJ2pa+/+IjGmcg7+36xDqprrVmOaLQa7tXlA==";

function hashPassword(password: string): string {
  const salt = nodeCrypto.randomBytes(16).toString("base64");
  const hash = nodeCrypto.scryptSync(password, salt, KEYLEN, { N: COST_N, r: COST_R, p: COST_P }).toString("base64");
  return `scrypt$${COST_N}$${COST_R}$${COST_P}$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const nNum = Number(n);
  const rNum = Number(r);
  const pNum = Number(p);
  if (!Number.isInteger(nNum) || !Number.isInteger(rNum) || !Number.isInteger(pNum)) return false;
  const candidate = nodeCrypto.scryptSync(password, salt, KEYLEN, { N: nNum, r: rNum, p: pNum });
  return nodeCrypto.timingSafeEqual(candidate, Buffer.from(hash, "base64"));
}

/** Timing parity for unknown emails — never throws, never matches. */
function dummyVerify(password: string): void {
  try {
    verifyPassword(password, DUMMY_HASH);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Sessions (cookie vc_session, sha256 token stored, 30-day TTL)       */
/* ------------------------------------------------------------------ */

export const SESSION_COOKIE = "vc_session";
const SESSION_TTL_SECONDS = 2592000; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
}

function sha256Hex(value: string): string {
  return nodeCrypto.createHash("sha256").update(value).digest("hex");
}

/** Secure flag only behind the HTTPS proxy (sets x-forwarded-proto). */
function isSecureRequest(): boolean {
  const proto = getRequestHeader("x-forwarded-proto");
  return proto?.split(",")[0]?.trim() === "https";
}

async function createSession(userId: string): Promise<void> {
  const token = nodeCrypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  await sql()`
    insert into sessions (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash}, now() + make_interval(secs => ${SESSION_TTL_SECONDS}))
  `;
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure: isSecureRequest(),
  });
}

async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = sha256Hex(token);

  const rows = await sql()`
    select u.id, u.email, u.name, s.plan
    from sessions sess
    join users u on u.id = sess.user_id
    join subscriptions s on s.user_id = u.id and s.status = 'active'
    where sess.token_hash = ${tokenHash} and sess.expires_at > now()
    order by s.created_at desc
    limit 1
  `;
  if (rows.length === 0) return null;

  // Lazy last_seen bump — fire and forget, never fail the request on it.
  void sql()`update sessions set last_seen_at = now() where token_hash = ${tokenHash}`.catch(() => {
    /* best-effort only */
  });

  const row = rows[0] as { id: string; email: string; name: string | null; plan: string };
  return { id: row.id, email: row.email, name: row.name, plan: row.plan };
}

async function destroySession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await sql()`delete from sessions where token_hash = ${sha256Hex(token)}`.catch(() => {
      /* best-effort only */
    });
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

/* ------------------------------------------------------------------ */
/* Server functions                                                    */
/* ------------------------------------------------------------------ */

export type AuthFailureReason = "setup" | "email" | "password" | "exists" | "invalid";

export type SignupResult = { ok: true } | { ok: false; reason: AuthFailureReason };
export type LoginResult = { ok: true } | { ok: false; reason: AuthFailureReason };

export interface AuthInput {
  name?: string;
  email: string;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Signup: validate → user + free subscription atomically → session. */
export const signup = createServerFn({ method: "POST" })
  .validator((d: unknown): AuthInput => d as AuthInput)
  .handler(async ({ data }): Promise<SignupResult> => {
    if (!dbAvailable()) return { ok: false, reason: "setup" };

    const email = (data.email ?? "").trim().toLowerCase();
    const password = data.password ?? "";
    const name = (data.name ?? "").trim().slice(0, 120) || null;

    if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, reason: "email" };
    if (password.length < 8) return { ok: false, reason: "password" };

    // One atomic statement: user + free subscription; emails unique at the DB
    // level (ON CONFLICT DO NOTHING) so racing signups can't double-create.
    const rows = await sql()`
      with new_user as (
        insert into users (email, name, password_hash)
        values (${email}, ${name}, ${hashPassword(password)})
        on conflict (email) do nothing
        returning id
      )
      insert into subscriptions (user_id, plan, price_cents, status, source)
      select id, 'free', 0, 'active', 'manual' from new_user
      returning user_id
    `;
    if (rows.length === 0) return { ok: false, reason: "exists" };

    await createSession(String(rows[0].user_id));
    return { ok: true };
  });

/** Login: verify credentials, create session, set cookie. */
export const login = createServerFn({ method: "POST" })
  .validator((d: unknown): AuthInput => d as AuthInput)
  .handler(async ({ data }): Promise<LoginResult> => {
    if (!dbAvailable()) return { ok: false, reason: "setup" };

    const email = (data.email ?? "").trim().toLowerCase();
    const password = data.password ?? "";
    if (!email || !password) return { ok: false, reason: "invalid" };

    const rows = await sql()`
      select u.id, u.password_hash
      from users u
      where u.email = ${email}
      limit 1
    `;
    if (rows.length === 0) {
      dummyVerify(password); // timing parity for unknown emails
      return { ok: false, reason: "invalid" };
    }
    const row = rows[0] as { id: string; password_hash: string };
    if (!verifyPassword(password, row.password_hash)) {
      return { ok: false, reason: "invalid" };
    }

    await createSession(row.id);
    return { ok: true };
  });

/** Logout: destroy the session row and clear the cookie. */
export const logout = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: true }> => {
  await destroySession();
  return { ok: true };
});

/** Platform status for pages: whether accounts can be created yet. */
export const authStatus = createServerFn({ method: "GET" }).handler(async () => ({
  db: dbAvailable(),
}));

/** Current user (null when no valid session). Safe to call from any loader. */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    return await getSessionUser();
  },
);

/**
 * Route guard: returns the user or null. Throw the redirect in beforeLoad:
 *
 *   const user = await requireUser();
 *   if (!user) throw redirect({ to: "/login", search: { next: "/dashboard" } });
 */
export const requireUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    return await getSessionUser();
  },
);

/**
 * Server-only helper for OTHER server modules — resolve the signed-in user
 * inside their own handlers (coach fns, onboarding writes).
 *
 * Not a createServerFn: never call it from client code. This file already
 * imports `@tanstack/react-start/server`, so TanStack Start's import
 * protection mocks the whole module in the client build; anything imported
 * from here by a handler is dropped along with the handler body.
 */
export async function sessionUser(): Promise<SessionUser | null> {
  return await getSessionUser();
}