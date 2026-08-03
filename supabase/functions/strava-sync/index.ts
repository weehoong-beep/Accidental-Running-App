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

/**
 * Strava's per-activity detail (best efforts, laps, splits) needs one request
 * each, against a budget of 100 requests per 15 minutes. Cap each sync well
 * inside that and let repeat syncs work through any backlog.
 */
const DETAIL_FETCH_LIMIT = 25

/**
 * Session types Strava's `workout_type` hints at, used to break ties when more
 * than one session sits on the same date. 1 = race, 2 = long run, 3 = workout.
 */
const WORKOUT_TYPE_HINT: Record<number, string[]> = {
  1: ["race"],
  2: ["long"],
  3: ["tempo", "interval", "race_pace"]
}

/**
 * Best-effort names Strava reports for runs, mapped to the distances the app
 * tracks records at. Distances match PR_DISTANCES in src/screens/Profile.tsx so
 * imported and hand-entered records line up.
 */
const BEST_EFFORT_DISTANCES: Record<string, { label: string; distanceM: number }> = {
  "1 mile": { label: "1 Mile", distanceM: 1609 },
  "5k": { label: "5K", distanceM: 5000 },
  "10k": { label: "10K", distanceM: 10000 },
  "15k": { label: "15K", distanceM: 15000 },
  "10 mile": { label: "10 Mile", distanceM: 16093 },
  "half marathon": { label: "Half Marathon", distanceM: 21097 },
  marathon: { label: "Marathon", distanceM: 42195 }
}

/**
 * Chooses which planned session an activity should complete.
 *
 * Only considers sessions on the same date that no activity has already claimed,
 * so two runs on one day cannot both overwrite the same session, and a session
 * completed by hand can still be linked to the run that fulfilled it.
 */
function pickSession(
  sessions: any[],
  localDate: string,
  isRun: boolean,
  workoutType: number | null | undefined,
  claimed: Set<string>
): any | null {
  const compatible = sessions.filter(
    (s) =>
      s.session_date === localDate &&
      !claimed.has(s.id) &&
      (isRun ? RUNNABLE_TYPES.has(s.session_type) : s.session_type === "cross_train")
  )
  if (compatible.length === 0) return null

  const hints = workoutType != null ? WORKOUT_TYPE_HINT[workoutType] : undefined
  if (hints) {
    const hinted = compatible.find((s) => hints.includes(s.session_type))
    if (hinted) return hinted
  }
  return compatible[0]
}

/**
 * Fetches detail for runs that lack it, merges splits/laps/best efforts into
 * `activities.raw`, and promotes each best effort into `personal_records` when it
 * beats what is already stored.
 */
async function fetchRunDetail(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  accessToken: string
): Promise<{ fetched: number; remaining: number; recordsUpdated: number }> {
  const { data: pending, count } = await supabase
    .from("activities")
    .select("id, strava_activity_id, raw", { count: "exact" })
    .eq("user_id", userId)
    .ilike("sport_type", "%run%")
    .is("fetched_detail_at", null)
    .order("start_date_local", { ascending: false })
    .limit(DETAIL_FETCH_LIMIT)

  if (!pending || pending.length === 0) {
    return { fetched: 0, remaining: 0, recordsUpdated: 0 }
  }

  // Fastest time seen per distance across this batch.
  const best = new Map<number, { label: string; timeSec: number; activityId: number; date: string | null }>()
  let fetched = 0

  for (const row of pending as any[]) {
    const res = await fetch(`https://www.strava.com/api/v3/activities/${row.strava_activity_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!res.ok) {
      // Most likely the rate limit or a deleted activity. Leave
      // fetched_detail_at null so the next sync retries this one.
      if (res.status === 429) break
      continue
    }
    const detail = await res.json()

    await supabase
      .from("activities")
      .update({
        raw: { ...(row.raw ?? {}), ...detail },
        fetched_detail_at: new Date().toISOString()
      })
      .eq("id", row.id)
    fetched++

    for (const effort of (detail.best_efforts ?? []) as any[]) {
      const mapped = BEST_EFFORT_DISTANCES[String(effort.name ?? "").toLowerCase()]
      if (!mapped || !(effort.elapsed_time > 0)) continue
      const current = best.get(mapped.distanceM)
      if (!current || effort.elapsed_time < current.timeSec) {
        best.set(mapped.distanceM, {
          label: mapped.label,
          timeSec: effort.elapsed_time,
          activityId: row.strava_activity_id,
          date: (effort.start_date_local ?? detail.start_date_local ?? null)?.slice(0, 10) ?? null
        })
      }
    }
  }

  let recordsUpdated = 0
  if (best.size > 0) {
    const { data: existing } = await supabase
      .from("personal_records")
      .select("distance_m, time_sec")
      .eq("user_id", userId)
      .eq("source", "strava")
      .in("distance_m", [...best.keys()])
    const stored = new Map<number, number>(
      (existing ?? []).map((r: any) => [r.distance_m, r.time_sec])
    )

    const rows = [...best.entries()]
      .filter(([distanceM, b]) => {
        const previous = stored.get(distanceM)
        return previous == null || b.timeSec < previous
      })
      .map(([distanceM, b]) => ({
        user_id: userId,
        distance_m: distanceM,
        distance_label: b.label,
        time_sec: b.timeSec,
        achieved_on: b.date,
        source: "strava",
        strava_activity_id: b.activityId,
        updated_at: new Date().toISOString()
      }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from("personal_records")
        .upsert(rows, { onConflict: "user_id,distance_m,source" })
      if (error) throw error
      recordsUpdated = rows.length
    }
  }

  const remaining = Math.max(0, (count ?? 0) - fetched)
  return { fetched, remaining, recordsUpdated }
}

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

    // Fetch existing sessions once for matching. A `= []` default would not catch
    // the null Supabase returns on error, so fall back explicitly.
    const sessionsRes = plan
      ? await supabase.from("training_sessions").select("*").eq("plan_id", plan.id)
      : { data: [] as any[] }
    const sessions: any[] = sessionsRes.data ?? []

    // Sessions already claimed by an activity, so two runs on the same day cannot
    // both overwrite the same session's actuals.
    const { data: linkedRows } = await supabase
      .from("activities")
      .select("matched_session_id")
      .eq("user_id", userId)
      .not("matched_session_id", "is", null)
    const claimed = new Set<string>((linkedRows ?? []).map((r: any) => r.matched_session_id))

    let matchedCount = 0

    // Oldest first, so same-day runs claim sessions in the order they were run.
    const ordered = [...(activities as any[])].sort((a, b) =>
      String(a.start_date_local).localeCompare(String(b.start_date_local))
    )

    for (const act of ordered) {
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
            workout_type: act.workout_type ?? null,
            // Strava reports run cadence for one leg only, so double it to get
            // true steps per minute.
            average_cadence: act.average_cadence != null ? act.average_cadence * 2 : null,
            average_temp: act.average_temp ?? null,
            suffer_score: act.suffer_score ?? null,
            gear_id: act.gear_id ?? null,
            raw: act
          },
          { onConflict: "strava_activity_id" }
        )
        .select()
        .single()
      if (upsertErr) throw upsertErr

      // Preserve a link this activity already has rather than re-matching it.
      if (upserted.matched_session_id) {
        claimed.add(upserted.matched_session_id)
        continue
      }

      const isRun = (act.sport_type ?? act.type ?? "").toLowerCase().includes("run")
      const candidate = pickSession(sessions, localDate, isRun, act.workout_type, claimed)

      if (candidate) {
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
          claimed.add(candidate.id)
          await supabase
            .from("activities")
            .update({ matched_session_id: candidate.id, match_status: matchStatus })
            .eq("id", upserted.id)
        }
      }
    }

    const detail = await fetchRunDetail(supabase, userId, accessToken)

    await supabase
      .from("strava_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", userId)

    return new Response(
      JSON.stringify({
        ok: true,
        synced: (activities as any[]).length,
        matched: matchedCount,
        detailFetched: detail.fetched,
        detailRemaining: detail.remaining,
        recordsUpdated: detail.recordsUpdated
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
