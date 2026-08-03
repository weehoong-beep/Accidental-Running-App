// Exchanges a Strava OAuth `code` for tokens using the user's own stored
// Strava Client ID / Secret (entered in Settings), and saves the connection.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const { code } = await req.json()
    if (!code) return new Response(JSON.stringify({ error: "Missing code" }), { status: 400, headers: CORS })

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

    const { data: settings, error: settingsErr } = await supabase
      .from("integration_settings")
      .select("strava_client_id, strava_client_secret")
      .eq("user_id", userId)
      .maybeSingle()
    if (settingsErr) throw settingsErr
    if (!settings?.strava_client_id || !settings?.strava_client_secret) {
      return new Response(
        JSON.stringify({ error: "Save your Strava Client ID and Secret in Settings first." }),
        { status: 400, headers: CORS }
      )
    }

    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: settings.strava_client_id,
        client_secret: settings.strava_client_secret,
        code,
        grant_type: "authorization_code"
      })
    })

    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok) {
      return new Response(
        JSON.stringify({ error: tokenJson?.message ?? "Strava token exchange failed" }),
        { status: 400, headers: CORS }
      )
    }

    const { error: upsertErr } = await supabase.from("strava_connections").upsert({
      user_id: userId,
      athlete_id: tokenJson.athlete?.id ?? null,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at: new Date(tokenJson.expires_at * 1000).toISOString(),
      scope: "read,activity:read_all",
      athlete: tokenJson.athlete ?? null,
      updated_at: new Date().toISOString()
    })
    if (upsertErr) throw upsertErr

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    })
  }
})
