// admin-write — the only place that checks the pool's admin passcode, and the
// only place that writes to actual_results / pool_settings / another
// player's PIN. Deploy this via the Supabase Dashboard (Edge Functions →
// Create a new function → name it "admin-write" → paste this file) and set
// the ADMIN_PASSCODE secret (Project Settings → Edge Functions → Secrets).
// See README.md for the full walkthrough.
//
// Regular player predictions never go through this function — the
// predictions table stays open to the anon key so players can keep saving
// their own picks exactly as before.

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

const ACTUAL_ROW_ID = "actual";
const POOL_SETTINGS_ROW_ID = "settings";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request." });
  }

  const passcode = body.passcode;
  const action = body.action;

  const adminPasscode = Deno.env.get("ADMIN_PASSCODE");
  if (!adminPasscode || passcode !== adminPasscode) {
    return json({ ok: false, error: "Wrong passcode." });
  }

  if (action === "verify") {
    return json({ ok: true });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (action === "save_actual_results") {
      const { error } = await supabase.from("actual_results").upsert({
        id: ACTUAL_ROW_ID,
        data: body.data,
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true });
    }

    if (action === "set_pool_settings") {
      const { data: existing } = await supabase
        .from("pool_settings")
        .select("data")
        .eq("id", POOL_SETTINGS_ROW_ID)
        .maybeSingle();

      const merged = Object.assign(
        { locked: false, revealPredictions: false, deadlineAutoLockApplied: false },
        existing?.data || {},
        body.changes as Record<string, unknown>,
      );

      const { error } = await supabase.from("pool_settings").upsert({
        id: POOL_SETTINGS_ROW_ID,
        data: merged,
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, settings: merged });
    }

    if (action === "reset_pin") {
      const name = String(body.name || "").trim();
      const pin = String(body.pin || "").trim();
      if (!name || !/^\d{4}$/.test(pin)) {
        return json({ ok: false, error: "Invalid name or PIN." });
      }
      const id = name.toLowerCase();

      const { data: existing, error: loadError } = await supabase
        .from("predictions")
        .select("data")
        .eq("id", id)
        .maybeSingle();
      if (loadError) return json({ ok: false, error: loadError.message });
      if (!existing) {
        return json({ ok: false, error: `No saved picks found for "${name}".` });
      }

      const existingData = (existing.data as Record<string, unknown>) || {};
      const updated = Object.assign({}, existingData, { pin });
      const displayName = (existingData.name as string) || name;

      const { error } = await supabase.from("predictions").upsert({
        id,
        display_name: displayName,
        data: updated,
        updated_at: new Date().toISOString(),
      });
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, name: displayName });
    }

    return json({ ok: false, error: "Unknown action." });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
});
