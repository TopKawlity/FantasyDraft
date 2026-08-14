#!/usr/bin/env node
// Fetches current Premier League standings and top scorers from
// football-data.org and stores them in the Supabase `live_stats` table,
// which powers the "Autofill from live data" button on the Update Results
// admin tab. Run by the "Sync Live Results" GitHub Actions workflow.
//
// Golden Glove (goalkeeper clean sheets) and Best Defence (team clean
// sheets) are deliberately left out — football-data.org's free tier
// doesn't expose either, so those two stay manual on the admin form.

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
const LIVE_STATS_ROW_ID = "current";

// Canonical club names as used by the site's <select> dropdowns
// (the TEAMS constant in index.html). football-data.org's team names
// ("Manchester City FC") and short names ("Man City") need to be
// normalized down to these before they'll match a dropdown option.
const TEAMS = [
  "Arsenal","Aston Villa","Bournemouth","Brentford","Brighton & Hove Albion",
  "Chelsea","Coventry City","Crystal Palace","Everton","Fulham","Hull City",
  "Ipswich Town","Leeds United","Liverpool","Manchester City","Manchester United",
  "Newcastle United","Nottingham Forest","Sunderland","Tottenham Hotspur",
];

function normalizeTeamName(name) {
  return name
    .toLowerCase()
    .replace(/\bfc\b/g, "")
    .replace(/\bafc\b/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_LOOKUP = new Map(TEAMS.map((t) => [normalizeTeamName(t), t]));

function matchTeamName(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = TEAM_LOOKUP.get(normalizeTeamName(candidate));
    if (match) return match;
  }
  return null;
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

async function fetchStandings() {
  const data = await footballDataFetch(`/competitions/${PL_COMPETITION_CODE}/standings`);
  const total = (data.standings || []).find((s) => s.type === "TOTAL");
  const table = total ? total.table : [];

  const unmatched = new Set();
  const rows = table.map((row) => {
    const matched = matchTeamName(row.team.name, row.team.shortName, row.team.tla);
    if (!matched) unmatched.add(row.team.name);
    return { position: row.position, team: matched, goalsFor: row.goalsFor };
  });

  const top6 = rows
    .filter((r) => r.position <= 6)
    .sort((a, b) => a.position - b.position)
    .map((r) => r.team);

  const bottom3 = rows
    .filter((r) => r.position > table.length - 3)
    .sort((a, b) => a.position - b.position)
    .map((r) => r.team);

  const bestAttack = rows.reduce(
    (best, r) => (r.goalsFor != null && (!best || r.goalsFor > best.goalsFor) ? r : best),
    null
  );

  return {
    top6,
    bottom3,
    bestAttack: bestAttack ? bestAttack.team : null,
    unmatchedTeams: [...unmatched],
  };
}

async function fetchScorers() {
  const data = await footballDataFetch(`/competitions/${PL_COMPETITION_CODE}/scorers?limit=25`);
  const scorers = data.scorers || [];

  const goldenBoot = scorers.reduce(
    (best, s) => (s.goals != null && (!best || s.goals > best.goals) ? s : best),
    null
  );
  const topAssist = scorers.reduce(
    (best, s) => (s.assists != null && (!best || s.assists > best.assists) ? s : best),
    null
  );

  return {
    goldenBoot: goldenBoot ? { name: goldenBoot.player.name, goals: goldenBoot.goals } : null,
    topAssist: topAssist ? { name: topAssist.player.name, assists: topAssist.assists } : null,
  };
}

async function saveLiveStats(payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/live_stats?on_conflict=id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: LIVE_STATS_ROW_ID,
      data: payload,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert failed (${res.status}): ${await res.text()}`);
  }
}

async function main() {
  console.log("Fetching Premier League standings...");
  const standings = await fetchStandings();
  if (standings.unmatchedTeams.length) {
    console.warn(
      "Could not match these API team names to a site dropdown option (left blank):",
      standings.unmatchedTeams
    );
  }

  console.log("Fetching top scorers...");
  const scorers = await fetchScorers();

  const payload = {
    top6: standings.top6,
    bottom3: standings.bottom3,
    bestAttack: standings.bestAttack,
    goldenBoot: scorers.goldenBoot,
    topAssist: scorers.topAssist,
  };

  console.log("Saving to Supabase:", JSON.stringify(payload, null, 2));
  await saveLiveStats(payload);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
