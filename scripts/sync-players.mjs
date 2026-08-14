#!/usr/bin/env node
// Syncs current Premier League squads from football-data.org into the
// Supabase `players` table, which powers the Golden Boot / Golden Glove /
// Most Assists suggestion lists on the site. Run by the "Sync Premier
// League Players" GitHub Actions workflow — not meant to be run against
// the anon key, since it needs the service_role key to write.

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

const FOOTBALL_DATA_API_KEY = requireEnv("FOOTBALL_DATA_API_KEY");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";
const PL_COMPETITION_CODE = "PL";
const REQUEST_SPACING_MS = 6500; // free tier is capped at 10 requests/minute

// football-data.org's free tier only reports broad position groups
// (Goalkeeper / Defence / Midfield / Offence), not fine-grained ones like
// "Attacking Midfield" — so anyone who creates or scores goals, including
// playmaking midfielders (e.g. Bruno Fernandes), shows up just as
// "Midfield". Bucket everyone except keepers and out-and-out defenders as
// a suggestion for Golden Boot / Most Assists, same spirit as the original
// hand-picked list, which already mixed strikers, wingers and creative
// midfielders together.
const GOALKEEPER_RE = /goalkeeper/i;
const DEFENDER_RE = /(defence|defender|-back$|wing-back)/i;

function classifyPosition(position) {
  if (!position) return null;
  if (GOALKEEPER_RE.test(position)) return "keeper";
  if (DEFENDER_RE.test(position)) return null;
  return "forward";
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function footballDataFetch(path) {
  const res = await fetch(`${FOOTBALL_API_BASE}${path}`, {
    headers: { "X-Auth-Token": FOOTBALL_DATA_API_KEY },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`football-data.org request failed (${res.status}) for ${path}: ${body}`);
  }
  return res.json();
}

async function fetchPlayers() {
  const { teams } = await footballDataFetch(`/competitions/${PL_COMPETITION_CODE}/teams`);
  const players = [];

  for (const team of teams) {
    await sleep(REQUEST_SPACING_MS);
    const fullTeam = await footballDataFetch(`/teams/${team.id}`);
    for (const p of fullTeam.squad || []) {
      const bucket = classifyPosition(p.position);
      if (!bucket || !p.name) continue;
      const teamLabel = team.shortName || team.name;
      players.push({
        id: `${slugify(teamLabel)}-${slugify(p.name)}`,
        name: p.name,
        team: teamLabel,
        position: bucket,
        updated_at: new Date().toISOString(),
      });
    }
  }
  return players;
}

async function replacePlayersTable(players) {
  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  // Clear stale rows (transfers, retirements) before inserting the fresh set.
  const del = await fetch(`${SUPABASE_URL}/rest/v1/players?id=not.is.null`, {
    method: "DELETE",
    headers,
  });
  if (!del.ok) {
    throw new Error(`Supabase delete failed (${del.status}): ${await del.text()}`);
  }

  const insert = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(players),
  });
  if (!insert.ok) {
    throw new Error(`Supabase insert failed (${insert.status}): ${await insert.text()}`);
  }
}

async function main() {
  console.log("Fetching Premier League squads from football-data.org...");
  const players = await fetchPlayers();
  console.log(`Fetched ${players.length} forwards/goalkeepers across the league.`);
  if (players.length === 0) {
    console.error("No players fetched — aborting without touching Supabase.");
    process.exit(1);
  }
  console.log("Replacing players table in Supabase...");
  await replacePlayersTable(players);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
