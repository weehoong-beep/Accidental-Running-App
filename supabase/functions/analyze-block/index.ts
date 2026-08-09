// Generates an AI (OpenAI) analysis of the whole training block so far:
// consistency, mileage trend, adherence to the Higdon plan, and race readiness.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

const MODEL = "gpt-4o"

function paceStr(secPerKm: number | null) {
  if (!secPerKm) return "unknown"
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, "0")}/km`
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const { plan_id } = await req.json()
    if (!plan_id) return new Response(JSON.stringify({ error: "Missing plan_id" }), { status: 400, headers: CORS })

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
      .select("openai_api_key")
      .eq("user_id", userId)
      .maybeSingle()
    if (!settings?.openai_api_key) {
      return new Response(JSON.stringify({ error: "Add your OpenAI API key in Settings first." }), {
        status: 400,
        headers: CORS
      })
    }

    const [{ data: plan }, { data: race }, sessionsRes, { data: profile }] = await Promise.all([
      supabase.from("training_plans").select("*").eq("id", plan_id).single(),
      supabase
        .from("training_plans")
        .select("race_events(*)")
        .eq("id", plan_id)
        .single()
        .then((r) => ({ data: (r.data as any)?.race_events })),
      supabase.from("training_sessions").select("*").eq("plan_id", plan_id).order("session_date"),
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
    ])
    // Supabase returns null (not undefined) on error, which a default parameter
    // would not catch.
    const sessions = sessionsRes.data ?? []

    const today = new Date().toISOString().slice(0, 10)
    const past = sessions.filter((s: any) => s.session_date <= today && s.session_type !== "rest")
    const completed = past.filter((s: any) => s.status === "completed")
    const missed = past.filter((s: any) => s.status !== "completed")
    const plannedKm = past.reduce((sum: number, s: any) => sum + (s.planned_distance_m ?? 0), 0) / 1000
    const actualKm = completed.reduce(
      (sum: number, s: any) => sum + (s.actual_distance_m ?? s.planned_distance_m ?? 0),
      0
    ) / 1000

    const weekBreakdown = Array.from(new Set(sessions.map((s: any) => s.week_index)))
      .sort((a: any, b: any) => a - b)
      .map((w) => {
        const weekSessions = sessions.filter((s: any) => s.week_index === w && s.session_type !== "rest")
        const weekPast = weekSessions.filter((s: any) => s.session_date <= today)
        const weekDone = weekPast.filter((s: any) => s.status === "completed")
        return `Week ${w}: ${weekDone.length}/${weekPast.length} sessions done${weekPast.length ? "" : " (upcoming)"}`
      })
      .join("\n")

    const profileBlock = profile
      ? `About this athlete:
- VDOT: ${profile.vdot ?? "unknown"}
- Easy pace range: ${paceStr(profile.easy_pace_min_sec)}–${paceStr(profile.easy_pace_max_sec)}
- Threshold pace: ${paceStr(profile.threshold_pace_sec_per_km)}; Interval pace: ${paceStr(profile.interval_pace_sec)}
- Resting HR: ${profile.resting_hr ?? "unknown"} bpm; Max HR: ${profile.max_hr ?? "unknown"} bpm
- Goal time for the race: ${
          race?.goal_time_sec ? Math.floor(race.goal_time_sec / 60) + " min" : "not set"
        }`
      : "No athlete profile details are on record."

    const prompt = `You are an experienced running coach reviewing an athlete's progress through Hal Higdon's Half Marathon Training — Intermediate 2 program (${plan.weeks} weeks), targeting "${race?.name ?? "their race"}" on ${race?.race_date ?? "race day"} (${race?.distance_label ?? "Half Marathon"}).

${profileBlock}

Progress so far (through today, ${today}):
- Sessions completed: ${completed.length} of ${past.length} scheduled so far
- Missed/incomplete: ${missed.length}
- Planned distance so far: ${plannedKm.toFixed(1)} km
- Actual logged distance so far: ${actualKm.toFixed(1)} km

Week-by-week completion:
${weekBreakdown}

Write a concise (4-6 sentence) block-level analysis: overall adherence and consistency, whether mileage is tracking on plan, any concerning gaps (e.g. missed long runs or intervals), and one clear recommendation for the athlete heading into the next block of weeks. If a goal time is set, say whether their current fitness makes it realistic. Speak directly to the athlete ("you"). No headers or bullet lists — a short paragraph.`

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.openai_api_key}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      })
    })

    const openaiJson = await openaiRes.json()
    if (!openaiRes.ok) {
      return new Response(JSON.stringify({ error: openaiJson?.error?.message ?? "OpenAI request failed" }), {
        status: 400,
        headers: CORS
      })
    }

    const content = openaiJson.choices?.[0]?.message?.content ?? "No analysis generated."

    await supabase.from("insights").delete().eq("plan_id", plan_id).eq("kind", "block")

    const { data: insight, error: insErr } = await supabase
      .from("insights")
      .insert({
        user_id: userId,
        kind: "block",
        plan_id,
        insight_date: today,
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
