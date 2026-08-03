// Generates an AI (Claude) analysis of the whole training block so far:
// consistency, mileage trend, adherence to the Higdon plan, and race readiness.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

const MODEL = "claude-sonnet-5"

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
      .select("anthropic_api_key")
      .eq("user_id", userId)
      .maybeSingle()
    if (!settings?.anthropic_api_key) {
      return new Response(JSON.stringify({ error: "Add your Claude API key in Settings first." }), {
        status: 400,
        headers: CORS
      })
    }

    const [{ data: plan }, { data: race }, { data: sessions = [] }] = await Promise.all([
      supabase.from("training_plans").select("*").eq("id", plan_id).single(),
      supabase
        .from("training_plans")
        .select("race_events(*)")
        .eq("id", plan_id)
        .single()
        .then((r) => ({ data: (r.data as any)?.race_events })),
      supabase.from("training_sessions").select("*").eq("plan_id", plan_id).order("session_date")
    ])

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

    const prompt = `You are an experienced running coach reviewing an athlete's progress through Hal Higdon's Half Marathon Training — Intermediate 2 program (9 weeks, ${plan.weeks} weeks total), targeting "${race?.name ?? "their race"}" on ${race?.race_date ?? "race day"} (${race?.distance_label ?? "Half Marathon"}).

Progress so far (through today, ${today}):
- Sessions completed: ${completed.length} of ${past.length} scheduled so far
- Missed/incomplete: ${missed.length}
- Planned distance so far: ${plannedKm.toFixed(1)} km
- Actual logged distance so far: ${actualKm.toFixed(1)} km

Week-by-week completion:
${weekBreakdown}

Write a concise (4-6 sentence) block-level analysis: overall adherence and consistency, whether mileage is tracking on plan, any concerning gaps (e.g. missed long runs or intervals), and one clear recommendation for the athlete heading into the next block of weeks. Speak directly to the athlete ("you"). No headers or bullet lists — a short paragraph.`

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
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

    await supabase.from("insights").delete().eq("plan_id", plan_id).eq("kind", "block")

    const { data: insight, error: insErr } = await supabase
      .from("insights")
      .insert({ user_id: userId, kind: "block", plan_id, insight_date: today, content, model: MODEL })
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
