// Fetches Strava's per-point GPS/elevation/heart-rate stream for a specific
// set of activities and caches it on activities.stream_data, so the Weekly
// Report's 3D route ribbon can render at full fidelity. Called on demand from
// the report screen for just the activities in the week being viewed —
// strava-sync never calls the streams endpoint itself, to keep its rate-limit
// budget for the activity list + detail (splits/laps/best-efforts) fetches.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

const STREAM_KEYS = "latlng,altitude,heartrate,distance,time"

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
    const { activity_ids } = await req.json()
    if (!Array.isArray(activity_ids) || activity_ids.length === 0) {
      return new Response(JSON.stringify({ error: "Missing activity_ids" }), { status: 400, headers: CORS })
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

    const [{ data: connection }, { data: settings }] = await Promise.all([
      supabase.from("strava_connections").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("integration_settings").select("*").eq("user_id", userId).maybeSingle()
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

    const { data: activities, error: actErr } = await supabase
      .from("activities")
      .select("id, strava_activity_id")
      .eq("user_id", userId)
      .in("id", activity_ids)
    if (actErr) throw actErr

    let fetched = 0
    const failed: string[] = []

    for (const activity of (activities ?? []) as any[]) {
      try {
        const res = await fetch(
          `https://www.strava.com/api/v3/activities/${activity.strava_activity_id}/streams?keys=${STREAM_KEYS}&key_by_type=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!res.ok) {
          // Rate-limited, revoked scope, or an activity too old for streams —
          // the report degrades that single run to split-interpolated fidelity.
          failed.push(activity.id)
          if (res.status === 429) break
          continue
        }
        const streamData = await res.json()
        await supabase.from("activities").update({ stream_data: streamData }).eq("id", activity.id)
        fetched++
      } catch {
        failed.push(activity.id)
      }
    }

    return new Response(JSON.stringify({ ok: true, fetched, failed }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    })
  }
})
