// auto-lock — the public, passcode-free trigger the site's countdown timer
// calls once the deadline hits zero. It re-checks the deadline itself
// server-side (never trusts the caller's clock) and only ever flips
// `locked` from false to true, exactly once, so it's safe for any visitor's
// browser to call. Deploy the same way as admin-write (Supabase Dashboard →
// Edge Functions → Create a new function → name it "auto-lock" → paste this
// file). No secret needs setting for this one.
//
// Keep PREDICTION_DEADLINE in sync with the PREDICTION_DEADLINE constant in
// index.html if you ever change the deadline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const POOL_SETTINGS_ROW_ID = "settings";
const PREDICTION_DEADLINE = new Date("2026-09-02T00:00:00+01:00");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (Date.now() < PREDICTION_DEADLINE.getTime()) {
      return json({ ok: true, locked: false, reason: "before deadline" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await supabase
      .from("pool_settings")
      .select("data")
      .eq("id", POOL_SETTINGS_ROW_ID)
      .maybeSingle();

    const current = Object.assign(
      { locked: false, revealPredictions: false, deadlineAutoLockApplied: false },
      existing?.data || {},
    );

    if (current.deadlineAutoLockApplied) {
      return json({ ok: true, locked: current.locked, reason: "already applied" });
    }

    const merged = Object.assign({}, current, { locked: true, deadlineAutoLockApplied: true });
    const { error } = await supabase.from("pool_settings").upsert({
      id: POOL_SETTINGS_ROW_ID,
      data: merged,
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ ok: false, error: error.message });

    return json({ ok: true, locked: true, settings: merged });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
});
