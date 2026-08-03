// Pulls recent runs from Strava, upserts them into `activities`, and
// auto-matches each run to the day's planned training_session — marking it
// completed (with actual km) whether it fully matches or falls well short.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

const RUNNABLE_TYPES = new Set(["easy", "tempo", "interval", "long", "race_pace", "race"])

async function refreshTokenIfNeeded(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  connection: any,
  clientId: string,
  clientSecret: string
) {
  const expiresAt = new Date(connection.expires_at).getTime()
  if (expiresAt > Date.now() + 5 * 60 * 1000) return connection.access_token

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token
    })
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.message ?? "Failed to refresh Strava token")

  await supabase
    .from("strava_connections")
    .update({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: new Date(json.expires_at * 1000).toISOString()
    })
    .eq("user_id", userId)

  return json.access_token as string
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

    const [{ data: connection }, { data: settings }, { data: plan }] = await Promise.all([
      supabase.from("strava_connections").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("integration_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("training_plans").select("*").eq("user_id", userId).eq("is_active", true).maybeSingle()
    ])

    if (!connection || !settings?.strava_client_id || !settings?.strava_client_secret) {
      return new Response(JSON.stringify({ error: "Strava is not connected yet." }), { status: 400, headers: CORS })
    }

    const accessToken = await refreshTokenIfNeeded(
      supabase,
      userId,
      connection,
      settings.strava_client_id,
      settings.strava_client_secret
    )

    const after = plan?.start_date
      ? Math.floor(new Date(plan.start_date + "T00:00:00Z").getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90

    const actRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const activities = await actRes.json()
    if (!actRes.ok) {
      return new Response(JSON.stringify({ error: activities?.message ?? "Failed to fetch Strava activities" }), {
        status: 400,
        headers: CORS
      })
    }

    // Fetch existing sessions once for matching
    const { data: sessions = [] } = plan
      ? await supabase.from("training_sessions").select("*").eq("plan_id", plan.id)
      : { data: [] }

    let matchedCount = 0

    for (const act of activities as any[]) {
      const localDate = (act.start_date_local as string).slice(0, 10)
      const distanceM = act.distance as number
      const avgSpeed = act.average_speed as number // m/s
      const avgPaceSecPerKm = avgSpeed > 0 ? Math.round(1000 / avgSpeed) : null

      const { data: upserted, error: upsertErr } = await supabase
        .from("activities")
        .upsert(
          {
            user_id: userId,
            strava_activity_id: act.id,
            name: act.name,
            sport_type: act.sport_type ?? act.type,
            start_date: act.start_date,
            start_date_local: act.start_date_local,
            local_date: localDate,
            distance_m: distanceM,
            moving_time_sec: act.moving_time,
            elapsed_time_sec: act.elapsed_time,
            average_speed_mps: avgSpeed,
            average_pace_sec_per_km: avgPaceSecPerKm,
            average_heartrate: act.average_heartrate ?? null,
            max_heartrate: act.max_heartrate ?? null,
            total_elevation_gain_m: act.total_elevation_gain ?? null,
            raw: act
          },
          { onConflict: "strava_activity_id" }
        )
        .select()
        .single()
      if (upsertErr) throw upsertErr

      const isRun = (act.sport_type ?? act.type ?? "").toLowerCase().includes("run")
      const candidate = sessions.find((s: any) => s.session_date === localDate)

      if (candidate && candidate.status !== "completed") {
        let matchStatus: "matched" | "partial" | "unmatched" = "unmatched"

        if (candidate.session_type === "cross_train" && !isRun) {
          matchStatus = "matched"
          await supabase
            .from("training_sessions")
            .update({ status: "completed", actual_duration_sec: act.moving_time })
            .eq("id", candidate.id)
        } else if (isRun && RUNNABLE_TYPES.has(candidate.session_type)) {
          const planned = candidate.planned_distance_m ?? 0
          const ratio = planned > 0 ? distanceM / planned : 1
          matchStatus = ratio >= 0.85 ? "matched" : "partial"
          await supabase
            .from("training_sessions")
            .update({
              status: "completed",
              actual_distance_m: Math.round(distanceM),
              actual_duration_sec: act.moving_time
            })
            .eq("id", candidate.id)
        }

        if (matchStatus !== "unmatched") {
          matchedCount++
          await supabase
            .from("activities")
            .update({ matched_session_id: candidate.id, match_status: matchStatus })
            .eq("id", upserted.id)
        }
      }
    }

    await supabase
      .from("strava_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", userId)

    return new Response(
      JSON.stringify({ ok: true, synced: (activities as any[]).length, matched: matchedCount }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    })
  }
})
