import type { HrZoneModel } from './physiology'

export type { HrZoneModel }

export type SessionType =
  | 'cross_train'
  | 'easy'
  | 'tempo'
  | 'interval'
  | 'race_pace'
  | 'long'
  | 'race'
  | 'rest'

export type SessionStatus = 'planned' | 'completed' | 'missed' | 'rescheduled' | 'swapped'

export interface TrainingSession {
  id: string
  user_id: string
  plan_id: string
  session_date: string
  week_index: number
  day_index: number
  session_type: SessionType
  title: string | null
  planned_distance_m: number | null
  planned_duration_sec: number | null
  target_pace_min_sec: number | null
  target_pace_max_sec: number | null
  target_hr_zone: string | null
  structured_steps: StructuredStep[] | null
  description: string | null
  status: SessionStatus
  actual_distance_m: number | null
  actual_duration_sec: number | null
  original_session_date: string | null
  swapped_with_session_id: string | null
  created_at: string
  updated_at: string
}

export interface StructuredStep {
  label: string
  repeat?: number
  distance_m?: number
  duration_sec?: number
  pace_sec_per_km?: number
  recovery?: string
}

export interface RaceEvent {
  id: string
  user_id: string
  name: string
  race_date: string
  distance_m: number | null
  distance_label: string | null
  goal_time_sec: number | null
  priority: string | null
  location: string | null
  notes: string | null
}

export interface TrainingPlan {
  id: string
  user_id: string
  race_event_id: string | null
  name: string | null
  methodology: string
  start_date: string
  weeks: number
  is_active: boolean
}

export interface Profile {
  id: string
  full_name: string | null
  timezone: string
  units: string
  resting_hr: number | null
  max_hr: number | null
  threshold_pace_sec_per_km: number | null
  vdot: number | null
  weight_kg: number | null
  height_cm: number | null
  date_of_birth: string | null
  sex: Sex | null
  lthr: number | null
  hr_zone_model: HrZoneModel | null
  /**
   * 'derived' recomputes paces from the primary personal record; 'manual' uses
   * whatever is stored in the pace columns below. Either way the columns hold
   * the current values, so the Edge Functions can read them without recomputing.
   */
  pace_source: PaceSource | null
  easy_pace_min_sec: number | null
  easy_pace_max_sec: number | null
  marathon_pace_sec: number | null
  interval_pace_sec: number | null
  repetition_pace_sec: number | null
  long_run_day: number | null
  days_per_week: number | null
}

export type Sex = 'male' | 'female' | 'unspecified'
export type PaceSource = 'derived' | 'manual'

export interface PersonalRecord {
  id: string
  user_id: string
  distance_m: number
  distance_label: string
  time_sec: number
  achieved_on: string | null
  source: 'manual' | 'strava'
  strava_activity_id: number | null
  race_name: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface StravaConnection {
  user_id: string
  athlete_id: number | null
  expires_at: string | null
  athlete: any
  last_sync_at: string | null
}

export interface IntegrationSettings {
  user_id: string
  strava_client_id: string | null
  strava_client_secret: string | null
  anthropic_api_key: string | null
}

export interface Activity {
  id: string
  user_id: string
  strava_activity_id: number
  name: string | null
  sport_type: string | null
  start_date_local: string | null
  local_date: string | null
  distance_m: number | null
  moving_time_sec: number | null
  average_pace_sec_per_km: number | null
  average_heartrate: number | null
  max_heartrate: number | null
  total_elevation_gain_m: number | null
  matched_session_id: string | null
  match_status: 'matched' | 'partial' | 'unmatched' | null
  /** Strava workout_type for runs: 0 default, 1 race, 2 long run, 3 workout. */
  workout_type: number | null
  /** True steps per minute — sync doubles Strava's one-leg figure. */
  average_cadence: number | null
  average_temp: number | null
  /** Strava "Relative Effort". Only present when the run recorded heart rate. */
  suffer_score: number | null
  /** Athlete-entered Rate of Perceived Exertion (1-10) from Strava, when set. */
  perceived_exertion: number | null
  gear_id: string | null
  /** When GET /activities/{id} was merged into `raw`. Null = splits/laps not yet fetched. */
  fetched_detail_at: string | null
  /** Strava's raw activity payload, e.g. `raw.map.summary_polyline` for the route shape. */
  raw?: { map?: { summary_polyline?: string | null } } & Record<string, any>
  /** Cached GET /activities/{id}/streams response, fetched on demand for the Weekly Report's 3D ribbon. */
  stream_data?: ActivityStreams | null
}

export interface Insight {
  id: string
  user_id: string
  kind: 'run' | 'block' | 'week'
  activity_id: string | null
  session_id: string | null
  plan_id: string | null
  /** Set together with plan_id for kind='week' narratives. */
  week_index: number | null
  insight_date: string | null
  content: string
  model: string | null
  created_at: string
  /** Set when plan pace targets were recalculated after this analysis was written. */
  is_stale: boolean | null
}

// ---------------------------------------------------------------------------
// Subsets of the Strava detailed-activity payload we read back out of
// `activities.raw`. Only the fields the splits and laps views use.
// ---------------------------------------------------------------------------

export interface ActivitySplit {
  split: number
  distance: number
  elapsed_time: number
  moving_time: number
  average_speed: number
  /** Grade-adjusted speed, m/s. Strava computes this for us. */
  average_grade_adjusted_speed?: number
  elevation_difference?: number | null
  average_heartrate?: number | null
  pace_zone?: number
}

export interface ActivityLap {
  id: number
  name: string | null
  lap_index: number
  distance: number
  elapsed_time: number
  moving_time: number
  average_speed: number
  max_speed?: number
  average_cadence?: number | null
  average_heartrate?: number | null
  max_heartrate?: number | null
  total_elevation_gain?: number | null
}

export interface BestEffort {
  name: string
  distance: number
  elapsed_time: number
  moving_time: number
  start_date_local?: string | null
  pr_rank?: number | null
}

/** The shape of `activities.raw` once the detail fetch has merged into it. */
export interface ActivityDetail {
  splits_metric?: ActivitySplit[]
  laps?: ActivityLap[]
  best_efforts?: BestEffort[]
}

// ---------------------------------------------------------------------------
// Strava's per-point stream data, fetched on demand for the Weekly Report's
// 3D route ribbon and cached on `activities.stream_data`.
// ---------------------------------------------------------------------------

/** One `GET /activities/{id}/streams` series, keyed by stream type (`key_by_type=true`). */
export interface ActivityStreams {
  latlng?: { data: [number, number][] }
  altitude?: { data: number[] }
  heartrate?: { data: number[] }
  distance?: { data: number[] }
  time?: { data: number[] }
}
