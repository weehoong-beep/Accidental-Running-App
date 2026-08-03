// Generates an AI (Claude) analysis of a single synced Strava run vs its
// matched Hal Higdon training-plan session.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

const MODEL = "claude-sonnet-5"

function paceStr(secPerKm: number | null) {
  if (!secPerKm) return "unknown"
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, "0")}/km`
}

function age(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth + "T00:00:00Z")
  if (Number.isNaN(dob.getTime())) return null
  const years = (Date.now() - dob.getTime()) / (365.2425 * 24 * 60 * 60 * 1000)
  return years > 0 && years < 120 ? Math.floor(years) : null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const { activity_id } = await req.json()
    if (!activity_id) return new Response(JSON.stringify({ error: "Missing activity_id" }), { status: 400, headers: CORS })

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

    const { data: settings } = await supabase
      .from("integration_settings")
      .select("anthropic_api_key")
      .eq("user_id", userId)
      .maybeSingle()
    if (!settings?.anthropic_api_key) {
      return new Response(JSON.stringify({ error: "Add your Claude API key in Settings first." }), {
        status: 400,
        headers: CORS
      })
    }

    const { data: activity, error: actErr } = await supabase
      .from("activities")
      .select("*")
      .eq("id", activity_id)
      .eq("user_id", userId)
      .single()
    if (actErr) throw actErr

    let session = null
    if (activity.matched_session_id) {
      const { data } = await supabase.from("training_sessions").select("*").eq("id", activity.matched_session_id).single()
      session = data
    }

    // The runner's own paces and heart-rate references, so the coaching is
    // judged against their actual thresholds rather than generic assumptions.
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    const profileBlock = profile
      ? `About this athlete:
- VDOT: ${profile.vdot ?? "unknown"}
- Easy pace range: ${paceStr(profile.easy_pace_min_sec)}–${paceStr(profile.easy_pace_max_sec)}
- Marathon pace: ${paceStr(profile.marathon_pace_sec)}
- Threshold pace: ${paceStr(profile.threshold_pace_sec_per_km)}
- Interval pace: ${paceStr(profile.interval_pace_sec)}
- Resting HR: ${profile.resting_hr ?? "unknown"} bpm; Max HR: ${profile.max_hr ?? "unknown"} bpm; Threshold HR: ${profile.lthr ?? "unknown"} bpm
- Age: ${age(profile.date_of_birth) ?? "unknown"}; Weight: ${profile.weight_kg ?? "unknown"} kg`
      : "No athlete profile details are on record."

    const prompt = `You are an experienced running coach analyzing one training run for an athlete following Hal Higdon's Half Marathon Training — Intermediate 2 program.

Actual run (from Strava):
- Name: ${activity.name}
- Distance: ${(activity.distance_m / 1000).toFixed(2)} km
- Moving time: ${Math.round(activity.moving_time_sec / 60)} min
- Average pace: ${paceStr(activity.average_pace_sec_per_km)}
- Average HR: ${activity.average_heartrate ?? "n/a"} bpm
- Max HR: ${activity.max_heartrate ?? "n/a"} bpm
- Elevation gain: ${activity.total_elevation_gain_m ?? 0} m
- Cadence: ${activity.average_cadence ? Math.round(activity.average_cadence) + " spm" : "n/a"}
- Temperature: ${activity.average_temp != null ? activity.average_temp + "°C" : "n/a"}
- Strava Relative Effort: ${activity.suffer_score ?? "n/a"}

${profileBlock}

${
  session
    ? `Planned session that day:
- Type: ${session.session_type} (${session.title})
- Planned distance: ${session.planned_distance_m ? (session.planned_distance_m / 1000).toFixed(1) + " km" : "n/a"}
- Target pace: ${paceStr(session.target_pace_min_sec)}${session.target_pace_max_sec && session.target_pace_max_sec !== session.target_pace_min_sec ? "–" + paceStr(session.target_pace_max_sec) : ""}
- Description: ${session.description ?? ""}`
    : "No matching planned session was found for this date."
}

Write a short (3-5 sentence), encouraging but honest analysis: did the run match the intent of the planned session (pace, effort, distance)? Judge pace and effort against this athlete's own paces and heart-rate figures above, not general rules of thumb — for example, only call an easy run "too fast" if it beat the fast end of their easy range. Call out anything notable (fell short on distance, strong tempo execution, heart rate higher than the pace suggests, heat likely a factor) and give one concrete, actionable tip for the next similar session. Speak directly to the athlete ("you"). No headers or bullet lists, just a short paragraph.`

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }]
      })
    })

    const claudeJson = await claudeRes.json()
    if (!claudeRes.ok) {
      return new Response(JSON.stringify({ error: claudeJson?.error?.message ?? "Claude request failed" }), {
        status: 400,
        headers: CORS
      })
    }

    const content = claudeJson.content?.[0]?.text ?? "No analysis generated."

    const { error: delErr } = await supabase.from("insights").delete().eq("activity_id", activity_id).eq("kind", "run")
    if (delErr) throw delErr

    const { data: insight, error: insErr } = await supabase
      .from("insights")
      .insert({
        user_id: userId,
        kind: "run",
        activity_id,
        session_id: activity.matched_session_id,
        insight_date: activity.local_date,
        content,
        model: MODEL,
        // Freshly generated against the current targets.
        is_stale: false
      })
      .select()
      .single()
    if (insErr) throw insErr

    return new Response(JSON.stringify({ ok: true, insight }), { headers: { ...CORS, "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    })
  }
})
