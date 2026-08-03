// Rewrites pace and heart-rate-zone targets across a training plan from the
// runner's current profile.
//
// This rewrites *every* session, completed ones included, so the whole block
// reads against one consistent set of numbers. The trade-off is that AI analyses
// already written against the old targets no longer match what their session
// shows, so those insights are flagged `is_stale` for regeneration.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  SESSION_TYPE_HR_ZONE,
  hasOwnPaces,
  paceTargetForType,
  pacesFromProfile
} from "../_shared/paces.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: CORS })
    }
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    let planId: string | undefined = body?.plan_id

    if (!planId) {
      const { data: activePlan } = await supabase
        .from("training_plans")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle()
      planId = activePlan?.id
    }
    if (!planId) {
      return new Response(JSON.stringify({ error: "No active training plan to update." }), {
        status: 400,
        headers: CORS
      })
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select(
        "easy_pace_min_sec, easy_pace_max_sec, marathon_pace_sec, threshold_pace_sec_per_km, interval_pace_sec, repetition_pace_sec"
      )
      .eq("id", userId)
      .maybeSingle()
    if (profileErr) throw profileErr

    if (!hasOwnPaces(profile)) {
      return new Response(
        JSON.stringify({
          error: "Set your paces on the profile screen first — add a race record or enter them manually."
        }),
        { status: 400, headers: CORS }
      )
    }
    const paces = pacesFromProfile(profile)

    // RLS already scopes this to the caller; the user_id filter keeps the query
    // narrow and makes the intent explicit.
    const { data: sessions, error: sessErr } = await supabase
      .from("training_sessions")
      .select("id, session_type, structured_steps")
      .eq("plan_id", planId)
      .eq("user_id", userId)
    if (sessErr) throw sessErr
    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ ok: true, updated: 0, staleInsights: 0 }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      })
    }

    let updated = 0
    for (const session of sessions) {
      const [paceMin, paceMax] = paceTargetForType(session.session_type, paces)

      // Interval reps carry their own pace inside structured_steps; keep those in
      // step with the new target rather than leaving the old number on screen.
      let steps = session.structured_steps
      if (Array.isArray(steps) && paceMin != null) {
        steps = steps.map((step: Record<string, unknown>) =>
          step && typeof step === "object" && "pace_sec_per_km" in step
            ? { ...step, pace_sec_per_km: paceMin }
            : step
        )
      }

      const { error } = await supabase
        .from("training_sessions")
        .update({
          target_pace_min_sec: paceMin,
          target_pace_max_sec: paceMax,
          target_hr_zone: SESSION_TYPE_HR_ZONE[session.session_type] ?? null,
          structured_steps: steps,
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id)
      if (error) throw error
      updated++
    }

    // Flag analyses written against the superseded targets. Run insights are
    // linked through their session, block insights directly through the plan.
    const sessionIds = sessions.map((s) => s.id)
    const [{ count: staleRuns }, { count: staleBlocks }] = await Promise.all([
      supabase
        .from("insights")
        .update({ is_stale: true }, { count: "exact" })
        .eq("user_id", userId)
        .in("session_id", sessionIds),
      supabase
        .from("insights")
        .update({ is_stale: true }, { count: "exact" })
        .eq("user_id", userId)
        .eq("plan_id", planId)
    ])

    return new Response(
      JSON.stringify({
        ok: true,
        updated,
        staleInsights: (staleRuns ?? 0) + (staleBlocks ?? 0)
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    })
  }
})
