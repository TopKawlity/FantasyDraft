-- The Prediction Room 26-27 — Supabase schema
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
-- for their own name — the client keys writes by name). This table is meant
-- to be publicly writable — it's how players self-service their own picks
-- without a login system — so it stays open even after the admin passcode
-- hardening further down this file.
create policy "Public write predictions" on predictions
  for insert with check (true);

create policy "Public update predictions" on predictions
  for update using (true) with check (true);

-- These two policies are intentionally removed later in this file (see the
-- "Admin passcode hardening" block at the bottom) once you've deployed the
-- admin-write Edge Function. Kept here so the table still works immediately
-- after this first run, before you've set that up.
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
-- revealed on the leaderboard (not just their points).
create table if not exists pool_settings (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table pool_settings enable row level security;

create policy "Public read pool_settings" on pool_settings
  for select using (true);

-- These two policies are intentionally removed later in this file (see the
-- "Admin passcode hardening" block at the bottom) once you've deployed the
-- admin-write and auto-lock Edge Functions. Kept here so the table still
-- works immediately after this first run, before you've set that up.
create policy "Public write pool_settings" on pool_settings
  for insert with check (true);

create policy "Public update pool_settings" on pool_settings
  for update using (true) with check (true);

-- ============================================================
-- Admin passcode hardening (run this LAST, only after you've deployed
-- both Edge Functions in supabase/functions/ and set the ADMIN_PASSCODE
-- secret — see README.md, "Moving admin writes behind a passcode-checked
-- server function"). Until you run this block, the admin passcode is
-- still only checked client-side, same as before; running it is what
-- actually closes that gap.
--
-- This removes the open public-write policies on actual_results and
-- pool_settings, so from this point on only the service_role key (used
-- inside the admin-write and auto-lock Edge Functions, never exposed to
-- the browser) can write to them. Nothing here touches the predictions
-- table — it stays fully open for insert/update, exactly as before, so
-- every player's existing saved picks and PINs, and everyone's ability
-- to keep saving their own picks, are completely unaffected.
-- ============================================================

drop policy if exists "Public write actual_results" on actual_results;
drop policy if exists "Public update actual_results" on actual_results;

drop policy if exists "Public write pool_settings" on pool_settings;
drop policy if exists "Public update pool_settings" on pool_settings;
