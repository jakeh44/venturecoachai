/**
 * 001_init — full bootstrap schema for VentureCoach AI.
 *
 * Conventions:
 * - Every table gets a UUID pk defaulting to gen_random_uuid() (built into
 *   Postgres 13+, no extension needed — Supabase runs 15+.)
 * - created_at / updated_at default to now(); an updated_at trigger keeps the
 *   latter honest on UPDATE.
 * - FK-relation tables carry business_id where the artifact belongs to one.
 * - usage_events is the enforcement + analytics ledger (see src/server/usage.ts).
 *
 * Run via: bun scripts/migrate.ts
 */

export const name = "001_init";

export const up: string[] = [
  /* ------------------------------------------------------------------ */
  /* users                                                              */
  /* ------------------------------------------------------------------ */
  `create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    name text,
    password_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,

  /* ------------------------------------------------------------------ */
  /* sessions (auth)                                                    */
  /* ------------------------------------------------------------------ */
  `create table if not exists sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    last_seen_at timestamptz,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists idx_sessions_user on sessions(user_id)`,
  `create index if not exists idx_sessions_expires on sessions(expires_at)`,

  /* ------------------------------------------------------------------ */
  /* subscriptions (plan snapshots)                                     */
  /* ------------------------------------------------------------------ */
  `create table if not exists subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    plan text not null check (plan in ('free','pro','elite')),
    price_cents integer not null,
    status text not null default 'active' check (status in ('active','trialing','past_due','canceled','paused')),
    source text not null default 'manual' check (source in ('manual','stripe')),
    stripe_customer_id text,
    current_period_start timestamptz,
    current_period_end timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists idx_subscriptions_user on subscriptions(user_id, status)`,
  `create index if not exists idx_subscriptions_stripe on subscriptions(stripe_customer_id)`,

  /* ------------------------------------------------------------------ */
  /* businesses (unique partial index: at most one current per user)    */
  /* ------------------------------------------------------------------ */
  `create table if not exists businesses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    name text not null,
    description text,
    stage text,
    is_current boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create unique index if not exists uniq_current_business_per_user
     on businesses(user_id) where is_current`,
  `create index if not exists idx_businesses_user on businesses(user_id)`,

  /* ------------------------------------------------------------------ */
  /* founder_profiles (business memory)                                 */
  /* ------------------------------------------------------------------ */
  `create table if not exists founder_profiles (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references businesses(id) on delete cascade,
    answers jsonb not null default '{}'::jsonb,
    profile jsonb not null default '{}'::jsonb,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create unique index if not exists uniq_founder_profile_business on founder_profiles(business_id)`,

  /* ------------------------------------------------------------------ */
  /* coaching_state (one row per business)                              */
  /* ------------------------------------------------------------------ */
  `create table if not exists coaching_state (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references businesses(id) on delete cascade,
    current_stage text not null default 'find'
      check (current_stage in ('find','validate','offer','sell','deliver','systemize','scale','optimize','delegate','exit-or-compound')),
    weekly_objective text,
    weekly_top_priorities jsonb not null default '[]'::jsonb,
    weekly_experiment jsonb,
    weekly_created_at timestamptz,
    daily_priorities jsonb not null default '[]'::jsonb,
    daily_created_at timestamptz,
    health_score integer check (health_score between 1 and 100),
    health_snapshot jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create unique index if not exists uniq_coaching_state_business on coaching_state(business_id)`,

  /* ------------------------------------------------------------------ */
  /* experiments                                                        */
  /* ------------------------------------------------------------------ */
  `create table if not exists experiments (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references businesses(id) on delete cascade,
    title text not null,
    hypothesis text,
    metric text,
    status text not null default 'proposed'
      check (status in ('proposed','running','done','dropped')),
    started_at timestamptz,
    ended_at timestamptz,
    result jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists idx_experiments_business on experiments(business_id)`,

  /* ------------------------------------------------------------------ */
  /* idea_analyses                                                      */
  /* ------------------------------------------------------------------ */
  `create table if not exists idea_analyses (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references businesses(id) on delete cascade,
    scores jsonb not null,
    known_assumed_unknown jsonb not null,
    validation_plan jsonb not null default '[]'::jsonb,
    summary text,
    source text not null default 'deterministic' check (source in ('deterministic','llm')),
    created_at timestamptz not null default now()
  )`,
  `create index if not exists idx_idea_analyses_business on idea_analyses(business_id)`,

  /* ------------------------------------------------------------------ */
  /* decisions (Decision Engine)                                        */
  /* ------------------------------------------------------------------ */
  `create table if not exists decisions (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references businesses(id) on delete cascade,
    prompt text not null,
    options jsonb not null default '[]'::jsonb,
    criteria jsonb not null default '[]'::jsonb,
    steps jsonb not null default '[]'::jsonb,
    recommendation jsonb,
    status text not null default 'open' check (status in ('open','decided','abandoned')),
    source text not null check (source in ('deterministic','llm')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists idx_decisions_business on decisions(business_id)`,

  /* ------------------------------------------------------------------ */
  /* usage_events (billing/limit ledger)                                */
  /* ------------------------------------------------------------------ */
  `create table if not exists usage_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    business_id uuid references businesses(id) on delete set null,
    feature text not null
      check (feature in ('idea_analysis','decision_guidance','bottleneck','daily_priorities','weekly_plan')),
    plan text not null check (plan in ('free','pro','elite')),
    meta jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists idx_usage_user_feature_time on usage_events(user_id, feature, created_at)`,
  `create index if not exists idx_usage_business on usage_events(business_id)`,

  /* ------------------------------------------------------------------ */
  /* module_artifacts (generic persisted coach output)                  */
  /* ------------------------------------------------------------------ */
  `create table if not exists module_artifacts (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references businesses(id) on delete cascade,
    module text not null,
    payload jsonb not null default '{}'::jsonb,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists idx_module_artifacts_business on module_artifacts(business_id)`,

  /* ------------------------------------------------------------------ */
  /* schema_migrations (runner bookkeeping — also ensured by the runner) */
  /* ------------------------------------------------------------------ */
  `create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`,

  /* ------------------------------------------------------------------ */
  /* updated_at trigger on mutable tables                               */
  /* ------------------------------------------------------------------ */
  `create or replace function set_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
  $$ language plpgsql`,

  `drop trigger if exists trg_users_updated on users`,
  `create trigger trg_users_updated before update on users for each row execute function set_updated_at()`,

  `drop trigger if exists trg_subscriptions_updated on subscriptions`,
  `create trigger trg_subscriptions_updated before update on subscriptions for each row execute function set_updated_at()`,

  `drop trigger if exists trg_businesses_updated on businesses`,
  `create trigger trg_businesses_updated before update on businesses for each row execute function set_updated_at()`,

  `drop trigger if exists trg_founder_profiles_updated on founder_profiles`,
  `create trigger trg_founder_profiles_updated before update on founder_profiles for each row execute function set_updated_at()`,

  `drop trigger if exists trg_coaching_state_updated on coaching_state`,
  `create trigger trg_coaching_state_updated before update on coaching_state for each row execute function set_updated_at()`,

  `drop trigger if exists trg_experiments_updated on experiments`,
  `create trigger trg_experiments_updated before update on experiments for each row execute function set_updated_at()`,

  `drop trigger if exists trg_decisions_updated on decisions`,
  `create trigger trg_decisions_updated before update on decisions for each row execute function set_updated_at()`,

  `drop trigger if exists trg_module_artifacts_updated on module_artifacts`,
  `create trigger trg_module_artifacts_updated before update on module_artifacts for each row execute function set_updated_at()`,
];