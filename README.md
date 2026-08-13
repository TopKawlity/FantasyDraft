# The Boot Room — 2026/27 Predictions

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

## Changing the admin passcode

The "Update Results" tab is gated by a passcode set in `index.html`:

```js
const ADMIN_PASS = "boot2026";
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
