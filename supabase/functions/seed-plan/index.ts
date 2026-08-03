// Seeds the Hal Higdon "Half Marathon Training — Intermediate 2" 9-week block
// (https://www.halhigdon.com/training-programs/half-marathon-training/intermediate-2-half-marathon/)
// for the authenticated user, ending at the KLSCM Half Marathon.
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  DEFAULT_PACES,
  type Paces,
  SESSION_TYPE_HR_ZONE,
  hasOwnPaces,
  paceStr,
  pacesFromProfile
} from "../_shared/paces.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

const START_DATE = "2026-08-03" // Monday, week 1 day 0
const RACE_DATE = "2026-10-04"

interface Row {
  week: number
  day: number
  type: string
  title: string
  distance_m?: number
  duration_sec?: number
  pace_min?: number
  pace_max?: number
  steps?: unknown[]
  description: string
}

/**
 * Builds the 9-week block against a given pace set, so the same plan structure
 * can be seeded at whatever fitness the runner's profile describes.
 */
function buildRows(p: Paces): Row[] {
  const easy = (week: number, day: number, km: number): Row => ({
    week,
    day,
    type: "easy",
    title: "Easy run",
    distance_m: Math.round(km * 1000),
    pace_min: p.easyMin,
    pace_max: p.easyMax,
    description: "Comfortable, conversational pace. If in doubt, go slower rather than faster."
  })

  const long = (week: number, day: number, km: number): Row => ({
    week,
    day,
    type: "long",
    title: "Long run",
    distance_m: Math.round(km * 1000),
    pace_min: p.easyMin,
    pace_max: p.easyMax,
    description: "Slow and steady at easy pace — the cornerstone workout of the week."
  })

  const cross = (week: number, day: number, min: number): Row => ({
    week,
    day,
    type: "cross_train",
    title: "Cross-training",
    duration_sec: min * 60,
    description: `${min} minutes of easy, low-impact cross-training (bike, swim, elliptical, brisk walk).`
  })

  const tempo = (week: number, day: number, min: number): Row => {
    const sec = min * 60
    const km = Math.round((sec / p.threshold) * 100) / 100
    return {
      week,
      day,
      type: "tempo",
      title: "Tempo run",
      duration_sec: sec,
      distance_m: Math.round(km * 1000),
      pace_min: p.threshold,
      pace_max: p.threshold,
      description: `${min} minutes continuous at threshold ("comfortably hard") effort, about ${paceStr(p.threshold)}.`
    }
  }

  const interval = (week: number, day: number, reps: number): Row => ({
    week,
    day,
    type: "interval",
    title: `${reps}×400m`,
    distance_m: reps * 400,
    pace_min: p.interval,
    pace_max: p.interval,
    steps: [
      { label: "400m repeat", repeat: reps, distance_m: 400, pace_sec_per_km: p.interval, recovery: "400m easy jog/walk" }
    ],
    description: `${reps} × 400m at approximately 5K race effort, with an equal-distance jog/walk recovery between reps.`
  })

  const rest = (week: number, day: number, title = "Rest day"): Row => ({
    week,
    day,
    type: "rest",
    title,
    description:
      title === "Rest day"
        ? "Full rest — no running (light stretching or mobility work is fine)."
        : "Take the day off, or if you're feeling strong, a short easy run is okay instead."
  })

  const race = (week: number, day: number, km: number, title: string): Row => ({
    week,
    day,
    type: "race",
    title,
    distance_m: Math.round(km * 1000),
    description: "Race effort — pace will vary by distance. Use it as a fitness check and a dress rehearsal for race-day logistics."
  })

  return [
    // Week 1
    cross(1, 0, 40), easy(1, 1, 6), tempo(1, 2, 35), easy(1, 3, 5), rest(1, 4), easy(1, 5, 5), long(1, 6, 11.5),
    // Week 2
    cross(2, 0, 40), easy(2, 1, 6.5), interval(2, 2, 7), easy(2, 3, 5), rest(2, 4), easy(2, 5, 5), long(2, 6, 13),
    // Week 3
    cross(3, 0, 50), easy(3, 1, 6.5), tempo(3, 2, 40), easy(3, 3, 5), rest(3, 4, "Rest or easy run"), rest(3, 5), race(3, 6, 10, "10K Race"),
    // Week 4
    rest(4, 0), easy(4, 1, 7.5), interval(4, 2, 8), easy(4, 3, 5), rest(4, 4), easy(4, 5, 6.5), long(4, 6, 14.5),
    // Week 5
    cross(5, 0, 50), easy(5, 1, 7.5), tempo(5, 2, 40), easy(5, 3, 5), rest(5, 4), easy(5, 5, 8), long(5, 6, 16),
    // Week 6
    cross(6, 0, 60), easy(6, 1, 8), interval(6, 2, 9), easy(6, 3, 5), rest(6, 4, "Rest or easy run"), rest(6, 5), race(6, 6, 15, "15K Race"),
    // Week 7
    rest(7, 0), easy(7, 1, 8), tempo(7, 2, 45), easy(7, 3, 5), rest(7, 4), easy(7, 5, 8), long(7, 6, 17.5),
    // Week 8
    cross(8, 0, 60), easy(8, 1, 8), interval(8, 2, 10), easy(8, 3, 5), rest(8, 4), easy(8, 5, 5), long(8, 6, 19.5),
    // Week 9 — race week
    rest(9, 0), easy(9, 1, 6.5), tempo(9, 2, 30), easy(9, 3, 3), rest(9, 4), rest(9, 5), race(9, 6, 21.1, "Half Marathon")
  ]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
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

    const { data: existingPlan } = await supabase
      .from("training_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle()

    if (existingPlan) {
      return new Response(JSON.stringify({ ok: true, already_seeded: true, plan_id: existingPlan.id }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      })
    }

    // Seed against the runner's own paces when they have set any, so a fresh
    // block starts at their real fitness rather than the built-in defaults.
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "easy_pace_min_sec, easy_pace_max_sec, marathon_pace_sec, threshold_pace_sec_per_km, interval_pace_sec, repetition_pace_sec"
      )
      .eq("id", userId)
      .maybeSingle()
    const paces = pacesFromProfile(profile)
    const usedProfilePaces = hasOwnPaces(profile)

    const { data: raceEvent, error: raceErr } = await supabase
      .from("race_events")
      .insert({
        user_id: userId,
        name: "KLSCM Half Marathon",
        race_date: RACE_DATE,
        distance_m: 21100,
        distance_label: "Half Marathon",
        priority: "A",
        location: "Kuala Lumpur"
      })
      .select()
      .single()
    if (raceErr) throw raceErr

    const { data: plan, error: planErr } = await supabase
      .from("training_plans")
      .insert({
        user_id: userId,
        race_event_id: raceEvent.id,
        name: "Half Marathon Training Block",
        methodology: "higdon",
        start_date: START_DATE,
        weeks: 9,
        is_active: true
      })
      .select()
      .single()
    if (planErr) throw planErr

    const sessionRows = buildRows(paces).map((r) => {
      const dayOffset = (r.week - 1) * 7 + r.day
      return {
        user_id: userId,
        plan_id: plan.id,
        session_date: addDays(START_DATE, dayOffset),
        week_index: r.week,
        day_index: r.day,
        session_type: r.type,
        title: r.title,
        planned_distance_m: r.distance_m ?? null,
        planned_duration_sec: r.duration_sec ?? null,
        target_pace_min_sec: r.pace_min ?? null,
        target_pace_max_sec: r.pace_max ?? null,
        target_hr_zone: SESSION_TYPE_HR_ZONE[r.type] ?? null,
        structured_steps: r.steps ?? null,
        description: r.description,
        status: "planned"
      }
    })

    const { error: sessErr } = await supabase.from("training_sessions").insert(sessionRows)
    if (sessErr) throw sessErr

    // Backfill the default threshold pace only for a runner who has none — never
    // overwrite a pace the profile screen derived or the runner typed in.
    await supabase
      .from("profiles")
      .update({ threshold_pace_sec_per_km: DEFAULT_PACES.threshold, units: "metric" })
      .eq("id", userId)
      .is("threshold_pace_sec_per_km", null)

    return new Response(
      JSON.stringify({ ok: true, plan_id: plan.id, used_profile_paces: usedProfilePaces }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" }
    })
  }
})
