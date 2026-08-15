# The Prediction Room 26-27

A friends & family prediction pool for the Premier League 2026/27 season, hosted as a
static site on GitHub Pages with [Supabase](https://supabase.com) as the backend so
predictions and results persist and sync for everyone (instead of `window.storage`,
which only works inside Claude.ai artifacts).

## One-time setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account/project.
2. Wait for the project to finish provisioning.

### 2. Create the database tables

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste in the contents of [`supabase-setup.sql`](./supabase-setup.sql) and run it.
   This creates the `predictions` and `actual_results` tables with the row-level
   security policies the site needs.

### 3. Get your API credentials

1. In the Supabase dashboard, go to **Project Settings → API**.
2. Copy the **Project URL** and the **`anon` `public`** key (not the `service_role`
   key — that one must never be exposed in client-side code).

### 4. Configure the site

Open `index.html` and near the top of the `<script>` block, fill in:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

with the values from step 3. Commit and push.

### 5. Enable GitHub Pages

1. In this repo on GitHub, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to `Deploy from a branch`, pick the
   branch this file lives on, and folder `/ (root)`.
3. Save. GitHub will give you a URL like `https://<user>.github.io/<repo>/`.

That's it — anyone with the link can now enter predictions, and everyone sees the
same live leaderboard and results.

## Keeping the award suggestions current (optional)

The Golden Boot / Golden Glove / Most Assists fields show autocomplete suggestions.
Out of the box these come from a static list baked into `index.html`. To have them
reflect the current Premier League squads instead, set up the scheduled sync:

### 1. Get a free football-data.org API key

1. Sign up at [football-data.org/client/register](https://www.football-data.org/client/register).
2. Copy the API key from your account page (free tier: 10 requests/minute, includes
   Premier League squads — plenty for a weekly sync).

### 2. Get your Supabase service_role key

1. In the Supabase dashboard, go to **Project Settings → API**.
2. Copy the **`service_role`** key. Unlike the anon key, this one bypasses Row Level
   Security and must **never** appear in `index.html` or anywhere client-side — it
   only goes into a GitHub Actions secret (step 3), which the browser never sees.

### 3. Add GitHub Actions secrets

In this repo on GitHub, go to **Settings → Secrets and variables → Actions**, and
add three repository secrets:

| Secret name | Value |
|---|---|
| `FOOTBALL_DATA_API_KEY` | the key from step 1 |
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | the key from step 2 |

### 4. Run the sync

The **Sync Premier League Players** workflow (`.github/workflows/sync-players.yml`)
runs automatically every Monday, and can also be triggered manually: go to the
**Actions** tab → **Sync Premier League Players** → **Run workflow**. It fetches
current squads from football-data.org and writes them into the `players` table
created by `supabase-setup.sql` (`scripts/sync-players.mjs` does the work).

The page reads from that table on load and swaps in the live names automatically;
until the workflow has run at least once, it just keeps showing the static
fallback list, so the site works fine either way.

## Autofilling actual results from live data (optional)

If you've already done the football-data.org + `service_role` setup above for the
award suggestions, this reuses the same three secrets — nothing new to add.

The **Sync Live Results** workflow (`.github/workflows/sync-live-stats.yml`) runs
daily (and can be triggered manually from the **Actions** tab), pulling current
league standings and top scorers from football-data.org into the `live_stats`
table (`scripts/sync-live-stats.mjs` does the work).

On the **Update Results** admin tab, after unlocking with the passcode, there's now
an **Autofill from live data** button. It pre-fills Top 6, Bottom 3, Best Attack,
Golden Boot and Most Assists from the last sync — but doesn't save anything by
itself, so you can review before clicking **Save Actual Results**.

Two fields are always left for you to fill in by hand: **Golden Glove** and **Best
Defence**. football-data.org's free tier doesn't expose goalkeeper-specific or
team clean sheet counts, so there's no reliable live source for those.

## Locking predictions and revealing picks

The **Update Results** admin tab has a **Pool Controls** card with two toggles,
both take effect immediately for everyone (no separate save step):

- **Lock Predictions** — once clicked, no one can save changes to their picks
  anymore (the predict tab shows a banner and the Save button is disabled). Click
  **Unlock Predictions** to reopen editing. Use this once your deadline (e.g. the
  transfer window closing) has passed.

  This also happens automatically: the predict tab shows a live countdown to a
  deadline hardcoded in `index.html` (`PREDICTION_DEADLINE`, currently 1hr after
  the 2026/27 transfer window closes). The moment it hits zero, the site locks
  itself for everyone — no manual click needed. After that automatic lock fires
  once, the toggle above goes back to behaving normally, so you can still
  manually unlock afterward (e.g. to grant a grace period) without the
  countdown re-locking it out from under you. To change the deadline, edit the
  `PREDICTION_DEADLINE` line in `index.html`.
- **Reveal Everyone's Picks** — once clicked, expanding any row on the leaderboard
  shows what that person actually picked in each category, not just the points
  they scored. Click **Hide Everyone's Picks** to go back to points-only.

Like the passcode gate, these are convenience controls, not hard security — anyone
with the site's `anon` key could still write to the site's data directly. Fine for
a friends & family pool; don't rely on it for anything that needs real enforcement.

## PIN-protected editing

On first save, each player sets a 4-digit PIN alongside their name. From then on,
both **Load my saved picks** and re-saving over that name require the matching
PIN — this stops someone else from loading (or overwriting) another player's
picks just by typing their name. Predictions saved before this feature existed
have no PIN yet; the next save on one of those simply sets a PIN going forward,
no matching required that first time.

If someone forgets their PIN, use **Reset a Player's PIN** on the Update Results
admin tab: enter their name and a new 4-digit PIN, and they can use that from
then on. Their saved picks aren't touched, only the PIN.

Note the PIN is stored in plain text inside each prediction's data (same public
`predictions` table as everything else) — it stops casual mix-ups and snooping
among friends, not someone deliberately reading the table via the `anon` key.
Same trust model as the rest of the admin controls.

## Changing the admin passcode

The "Update Results" tab is gated by a passcode set in `index.html`:

```js
const ADMIN_PASS = "boot2627";
```

Change it to whatever you like before publishing. Note this is a client-side-only
gate (same as the original artifact version) — it stops casual editing but isn't a
real security boundary, since anyone can read the page source. Don't put anything
sensitive behind it.

## How data is stored

- Each player's predictions are saved as one row in the `predictions` table, keyed
  by their name (lowercased).
- The real-world results used for scoring are saved as a single row in the
  `actual_results` table.
- Both tables are readable by anyone with the site's `anon` key (which is public by
  design — it's embedded in the page source), so the leaderboard works for everyone
  without a login system.

## Local development

Just open `index.html` in a browser, or serve the folder with any static file
server, e.g.:

```sh
python3 -m http.server 8000
```
