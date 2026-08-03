export type SessionType =
  | 'cross_train'
  | 'easy'
  | 'tempo'
  | 'interval'
  | 'race_pace'
  | 'long'
  | 'race'
  | 'rest'

export type SessionStatus = 'planned' | 'completed' | 'missed' | 'rescheduled'

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
}

export interface Insight {
  id: string
  user_id: string
  kind: 'run' | 'block'
  activity_id: string | null
  session_id: string | null
  plan_id: string | null
  insight_date: string | null
  content: string
  model: string | null
  created_at: string
}
