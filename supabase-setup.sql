-- The Boot Room — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Dashboard → SQL Editor → New query → Run).

-- One row per player, keyed by their lowercased name.
create table if not exists predictions (
  id text primary key,
  display_name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Single row holding the current real-world results, used to score everyone.
create table if not exists actual_results (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table predictions enable row level security;
alter table actual_results enable row level security;

-- Anyone with the site's anon key can read both tables (the leaderboard is public).
create policy "Public read predictions" on predictions
  for select using (true);

create policy "Public read actual_results" on actual_results
  for select using (true);

-- Anyone can save/update a prediction (each player only ever touches the row
-- for their own name — the client keys writes by name). Same open-write model
-- as the "Update Results" tab, which is gated only by the client-side
-- passcode in index.html. Good enough for a friends & family pool; anyone
-- who can read the site's source could bypass the passcode and write
-- directly to actual_results, so don't rely on this for anything sensitive.
create policy "Public write predictions" on predictions
  for insert with check (true);

create policy "Public update predictions" on predictions
  for update using (true) with check (true);

create policy "Public write actual_results" on actual_results
  for insert with check (true);

create policy "Public update actual_results" on actual_results
  for update using (true) with check (true);

-- Current Premier League players, used to power the Golden Boot / Golden
-- Glove / Most Assists suggestion lists. Kept fresh by the scheduled
-- "Sync Premier League Players" GitHub Actions workflow (scripts/sync-players.mjs),
-- which writes here using the Supabase service_role key — never the anon key
-- — so this table is intentionally read-only from the browser.
create table if not exists players (
  id text primary key,
  name text not null,
  team text not null,
  position text not null check (position in ('outfield', 'keeper')),
  updated_at timestamptz not null default now()
);

alter table players enable row level security;

create policy "Public read players" on players
  for select using (true);

-- Single row holding the latest live Premier League standings/scorers pulled
-- from football-data.org, used by the "Autofill from live data" button on
-- the Update Results admin tab. Kept fresh by the scheduled "Sync Live
-- Results" GitHub Actions workflow (scripts/sync-live-stats.mjs), which
-- writes here using the service_role key — read-only from the browser, same
-- as the players table. This is a starting point for the admin to review,
-- not an automatic publish: it only pre-fills the form.
create table if not exists live_stats (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table live_stats enable row level security;

create policy "Public read live_stats" on live_stats
  for select using (true);

-- Single row holding pool-wide admin controls: whether predictions are
-- locked from further editing, and whether everyone's individual picks are
-- revealed on the leaderboard (not just their points). Same open-write
-- model as actual_results — gated only by the client-side admin passcode.
create table if not exists pool_settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table pool_settings enable row level security;

create policy "Public read pool_settings" on pool_settings
  for select using (true);

create policy "Public write pool_settings" on pool_settings
  for insert with check (true);

create policy "Public update pool_settings" on pool_settings
  for update using (true) with check (true);
