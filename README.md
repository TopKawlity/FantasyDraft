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

1. In the Supabase dashboard, go to **Project Settings → API Keys** (older dashboards:
   **Project Settings → API**).
2. Copy the **Project URL** and your public client key — on newer projects this is
   the **`publishable`** key (starts with `sb_publishable_`); on older projects it's
   the **`anon` `public`** key. Either is safe to expose in client-side code. Never
   use the **`secret`**/**`service_role`** key here — that one must never appear in
   client-side code.
   - If your project shows a `publishable` key, use that one — it's required for
     the admin Edge Functions (see "Admin passcode & server-side write protection"
     below) to accept requests; the legacy `anon` key still works for plain
     database reads/writes but can get rejected by Edge Functions on newer
     projects.

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
  itself for everyone — no manual click needed, via the passcode-free
  `auto-lock` Edge Function, which re-checks the deadline itself server-side.
  After that automatic lock fires once, the toggle above goes back to behaving
  normally, so you can still manually unlock afterward (e.g. to grant a grace
  period) without the countdown re-locking it out from under you. To change
  the deadline, edit the `PREDICTION_DEADLINE` line in **both** `index.html`
  (the countdown display) and `supabase/functions/auto-lock/index.ts` (the
  server-side check) — then redeploy that function.
- **Reveal Everyone's Picks** — once clicked, expanding any row on the leaderboard
  shows what that person actually picked in each category, not just the points
  they scored. Click **Hide Everyone's Picks** to go back to points-only.

Once you've completed the Edge Function setup above, both of these toggles —
along with saving actual results and resetting PINs — are enforced
server-side: only someone who knows the admin passcode can trigger them,
regardless of what's visible in the page source. The one thing that's
still openly writable by design is the `predictions` table itself, since
players need to be able to save their own picks without a login system.

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

## Admin passcode & server-side write protection

The "Update Results" tab is gated by a passcode, but unlike a plain client-side
check, it's now verified **server-side** by a Supabase Edge Function
(`supabase/functions/admin-write`) — the passcode never appears anywhere in
`index.html`'s source, and every admin write (saving actual results, the lock/
reveal toggles, resetting a player's PIN) is routed through that function
instead of writing to the database directly with the public `anon` key. A
second, passcode-free function (`supabase/functions/auto-lock`) handles the
countdown's automatic lock at the deadline — it re-checks the deadline itself
on the server, so it can't be tricked into locking early or twice.

Regular player predictions are untouched by any of this: the `predictions`
table stays fully open so everyone can keep saving and loading their own picks
exactly as before, with no deploy step required for that to keep working.

### One-time setup: deploy the Edge Functions

1. In the Supabase dashboard, go to **Edge Functions** → **Deploy a new
   function**, name it `admin-write`, and paste in the contents of
   [`supabase/functions/admin-write/index.ts`](./supabase/functions/admin-write/index.ts).
   Deploy it.
2. Repeat for `auto-lock`, using
   [`supabase/functions/auto-lock/index.ts`](./supabase/functions/auto-lock/index.ts).
3. Go to **Edge Functions → Manage secrets** (or **Project Settings → Edge
   Functions**) and add a secret:

   | Secret name | Value |
   |---|---|
   | `ADMIN_PASSCODE` | your chosen passcode, e.g. `boot2627` |

   This is now the *only* place the passcode is set — there's nothing to
   change in `index.html` anymore. To change the passcode later, just update
   this secret.
4. In the Supabase dashboard, open **SQL Editor → New query**, paste in the
   **"Admin passcode hardening"** block at the bottom of
   [`supabase-setup.sql`](./supabase-setup.sql), and run it. This removes the
   old open public-write policies on `actual_results` and `pool_settings`, so
   from then on only the Edge Functions (using the `service_role` key, which
   Supabase injects automatically — you don't set it yourself) can write to
   them.

Do steps 1–3 before step 4 — that way admin writes work the whole time and
there's no window where the "Update Results" tab is broken. If you happen to
run step 4 first, admin writes will just fail with an error until you finish
1–3; nothing is lost, and player predictions keep working the entire time
regardless of the order.

No existing data is touched by any of this — it only changes who's allowed to
write to two tables going forward. Every player's saved predictions and PINs
are unaffected.

## How data is stored

- Each player's predictions are saved as one row in the `predictions` table, keyed
  by their name (lowercased).
- The real-world results used for scoring are saved as a single row in the
  `actual_results` table.
- Both tables are readable by anyone with the site's `anon` key (which is public by
  design — it's embedded in the page source), so the leaderboard works for everyone
  without a login system. `predictions` is also writable by anyone with the `anon`
  key (players self-service their own picks that way); `actual_results` is
  writable only through the passcode-checked `admin-write` Edge Function once
  you've completed the setup above.

## Local development

Just open `index.html` in a browser, or serve the folder with any static file
server, e.g.:

```sh
python3 -m http.server 8000
```
