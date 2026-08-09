// Generates an AI (Claude) narrative summary of one completed training week —
// the "kind: week" insight shown on the Weekly Running Report screen.
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

/** Minimal week totals, computed here rather than importing client-side lib code (Edge Functions don't share src/lib). */
function weekTotals(sessions: any[], activities: any[]) {
  const runnable = sessions.filter((s) => s.session_type !== "rest")
  const completed = runnable.filter((s) => s.status === "completed")
  let km = 0
  let durationSec = 0
  let elevationM = 0
  for (const s of completed) {
    const activity = activities.find((a) => a.matched_session_id === s.id)
    km += (activity?.distance_m ?? s.actual_distance_m ?? s.planned_distance_m ?? 0) / 1000
    durationSec += activity?.moving_time_sec ?? s.actual_duration_sec ?? s.planned_duration_sec ?? 0
    elevationM += activity?.total_elevation_gain_m ?? 0
  }
  return {
    completed: completed.length,
    runnable: runnable.length,
    km,
    avgPaceSecPerKm: km > 0 ? durationSec / km : null,
    elevationM
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const { plan_id, week_index } = await req.json()
    if (!plan_id || week_index == null) {
      return new Response(JSON.stringify({ error: "Missing plan_id or week_index" }), { status: 400, headers: CORS })
    }

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

    const [{ data: plan }, { data: allSessions }, { data: activities }, { data: profile }] = await Promise.all([
      supabase.from("training_plans").select("*").eq("id", plan_id).single(),
      supabase.from("training_sessions").select("*").eq("plan_id", plan_id).order("session_date"),
      supabase.from("activities").select("*").eq("user_id", userId),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
    ])

    const sessions = (allSessions ?? []).filter((s: any) => s.week_index === week_index)
    if (sessions.length === 0) {
      return new Response(JSON.stringify({ error: "No sessions found for this week." }), { status: 400, headers: CORS })
    }
    const runnable = sessions.filter((s: any) => s.session_type !== "rest")
    const completed = runnable.filter((s: any) => s.status === "completed")
    if (runnable.length === 0 || completed.length !== runnable.length) {
      return new Response(JSON.stringify({ error: "This week isn't fully completed yet." }), { status: 400, headers: CORS })
    }

    const activityList = activities ?? []
    const thisWeek = weekTotals(sessions, activityList)
    const priorSessions = (allSessions ?? []).filter((s: any) => s.week_index === week_index - 1)
    const priorWeek = priorSessions.length > 0 ? weekTotals(priorSessions, activityList) : null

    const startDate = sessions[0]?.session_date
    const endDate = sessions[sessions.length - 1]?.session_date

    const profileBlock = profile
      ? `About this athlete:
- VDOT: ${profile.vdot ?? "unknown"}
- Easy pace range: ${paceStr(profile.easy_pace_min_sec)}–${paceStr(profile.easy_pace_max_sec)}
- Threshold pace: ${paceStr(profile.threshold_pace_sec_per_km)}`
      : "No athlete profile details are on record."

    const sessionLines = sessions
      .map((s: any) => {
        const activity = activityList.find((a: any) => a.matched_session_id === s.id)
        const km = ((activity?.distance_m ?? s.actual_distance_m ?? s.planned_distance_m ?? 0) / 1000).toFixed(1)
        return `- ${s.session_date} ${s.session_type}${s.title ? ` (${s.title})` : ""}: ${
          s.session_type === "rest" ? "rest day" : `${s.status}, ${km} km`
        }${activity?.average_heartrate ? `, ${Math.round(activity.average_heartrate)} bpm avg` : ""}`
      })
      .join("\n")

    const prompt = `You are an experienced running coach reviewing one just-completed training week for an athlete following Hal Higdon's Half Marathon Training — Intermediate 2 program (Week ${week_index} of ${plan.weeks}, ${startDate} to ${endDate}).

${profileBlock}

This week's sessions:
${sessionLines}

This week's totals: ${thisWeek.km.toFixed(1)} km across ${thisWeek.completed} sessions, average pace ${paceStr(thisWeek.avgPaceSecPerKm)}, ${Math.round(thisWeek.elevationM)} m elevation gain.
${
  priorWeek
    ? `Prior week for comparison: ${priorWeek.km.toFixed(1)} km, average pace ${paceStr(priorWeek.avgPaceSecPerKm)}.`
    : "No prior week on record to compare against."
}

Write a short (3-5 sentence), encouraging but honest narrative summary of this week: overall execution and consistency, how it compares to the prior week if given, any standout session, and one clear focus for next week. Speak directly to the athlete ("you"). No headers or bullet lists, just a short paragraph.`

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

    await supabase.from("insights").delete().eq("plan_id", plan_id).eq("kind", "week").eq("week_index", week_index)

    const { data: insight, error: insErr } = await supabase
      .from("insights")
      .insert({
        user_id: userId,
        kind: "week",
        plan_id,
        week_index,
        insight_date: endDate,
        content,
        model: MODEL,
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
