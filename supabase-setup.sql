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
