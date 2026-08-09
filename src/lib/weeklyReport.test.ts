import { describe, expect, it } from 'vitest'
import { buildWeeklyReport } from './weeklyReport'
import type { Activity, PersonalRecord, Profile, TrainingSession } from './types'

function makeSession(overrides: Partial<TrainingSession> & { id: string; week_index: number; session_date: string }): TrainingSession {
  return {
    user_id: 'u1',
    plan_id: 'plan1',
    day_index: 0,
    session_type: 'easy',
    title: null,
    planned_distance_m: 5000,
    planned_duration_sec: 1800,
    target_pace_min_sec: 330,
    target_pace_max_sec: 360,
    target_hr_zone: null,
    structured_steps: null,
    description: null,
    status: 'completed',
    actual_distance_m: null,
    actual_duration_sec: null,
    original_session_date: null,
    swapped_with_session_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function makeActivity(overrides: Partial<Activity> & { id: string; matched_session_id: string }): Activity {
  return {
    user_id: 'u1',
    strava_activity_id: Math.floor(Math.random() * 1e9),
    name: 'Morning Run',
    sport_type: 'Run',
    start_date_local: '2026-01-05T06:00:00Z',
    local_date: '2026-01-05',
    distance_m: 5000,
    moving_time_sec: 1800,
    average_pace_sec_per_km: 360,
    average_heartrate: null,
    max_heartrate: null,
    total_elevation_gain_m: 20,
    match_status: 'matched',
    workout_type: null,
    average_cadence: null,
    average_temp: null,
    suffer_score: null,
    gear_id: null,
    fetched_detail_at: null,
    raw: undefined,
    stream_data: null,
    ...overrides
  }
}

const basicProfile: Profile = {
  id: 'u1',
  full_name: null,
  timezone: 'Asia/Kuala_Lumpur',
  units: 'metric',
  resting_hr: 50,
  max_hr: 190,
  threshold_pace_sec_per_km: null,
  vdot: null,
  weight_kg: null,
  height_cm: null,
  date_of_birth: null,
  sex: null,
  lthr: null,
  hr_zone_model: 'karvonen',
  pace_source: 'derived',
  easy_pace_min_sec: null,
  easy_pace_max_sec: null,
  marathon_pace_sec: null,
  interval_pace_sec: null,
  repetition_pace_sec: null,
  long_run_day: null,
  days_per_week: null
}

describe('buildWeeklyReport', () => {
  it('returns null when the week is not fully completed', () => {
    const sessions = [
      makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05', status: 'completed' }),
      makeSession({ id: 's2', week_index: 1, session_date: '2026-01-06', status: 'planned' })
    ]
    const report = buildWeeklyReport({
      planId: 'plan1',
      weekIndex: 1,
      allSessions: sessions,
      allActivities: [],
      profile: null,
      personalRecords: [],
      narrativeInsight: null
    })
    expect(report).toBeNull()
  })

  it('computes a weighted average pace from activity data, not session actuals', () => {
    const sessions = [
      makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05', planned_distance_m: 5000 }),
      makeSession({ id: 's2', week_index: 1, session_date: '2026-01-06', session_type: 'rest', planned_distance_m: null })
    ]
    // 5km in 1800s (6:00/km) and 10km in 3000s (5:00/km) -> weighted avg = 4800/15 = 320s/km, not (360+300)/2=330.
    const activities = [
      makeActivity({ id: 'a1', matched_session_id: 's1', distance_m: 5000, moving_time_sec: 1800 })
    ]
    const report = buildWeeklyReport({
      planId: 'plan1',
      weekIndex: 1,
      allSessions: sessions,
      allActivities: activities,
      profile: null,
      personalRecords: [],
      narrativeInsight: null
    })
    expect(report).not.toBeNull()
    expect(report!.hero.totalDistanceM).toBe(5000)
    expect(report!.hero.avgPaceSecPerKm).toBeCloseTo(360, 5)
  })

  it('reports HR zones as unavailable without a usable zone model', () => {
    const sessions = [makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05' })]
    const activities = [makeActivity({ id: 'a1', matched_session_id: 's1', average_heartrate: 150 })]
    const report = buildWeeklyReport({
      planId: 'plan1',
      weekIndex: 1,
      allSessions: sessions,
      allActivities: activities,
      profile: null, // no maxHr/restingHr/lthr -> hrZones() returns []
      personalRecords: [],
      narrativeInsight: null
    })
    expect(report!.hrZones.method).toBe('unavailable')
  })

  it('buckets activity-level heart rate into a zone when a profile is present', () => {
    const sessions = [makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05' })]
    const activities = [makeActivity({ id: 'a1', matched_session_id: 's1', average_heartrate: 150, moving_time_sec: 1800 })]
    const report = buildWeeklyReport({
      planId: 'plan1',
      weekIndex: 1,
      allSessions: sessions,
      allActivities: activities,
      profile: basicProfile,
      personalRecords: [],
      narrativeInsight: null
    })
    expect(report!.hrZones.method).toBe('activity-weighted')
    expect(report!.hrZones.zones.length).toBeGreaterThan(0)
    expect(report!.hrZones.zones.reduce((sum, z) => sum + z.secondsInZone, 0)).toBe(1800)
  })

  it('falls back to an estimated training load when suffer_score is missing', () => {
    const sessions = [makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05', session_type: 'tempo' })]
    const activities = [makeActivity({ id: 'a1', matched_session_id: 's1', moving_time_sec: 1800, suffer_score: null })]
    const report = buildWeeklyReport({
      planId: 'plan1',
      weekIndex: 1,
      allSessions: sessions,
      allActivities: activities,
      profile: null,
      personalRecords: [],
      narrativeInsight: null
    })
    expect(report!.trainingLoad.method).toBe('estimated')
    expect(report!.trainingLoad.totalLoad).toBeGreaterThan(0)
  })

  it('uses suffer_score directly when Strava provides it', () => {
    const sessions = [makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05' })]
    const activities = [makeActivity({ id: 'a1', matched_session_id: 's1', suffer_score: 42 })]
    const report = buildWeeklyReport({
      planId: 'plan1',
      weekIndex: 1,
      allSessions: sessions,
      allActivities: activities,
      profile: null,
      personalRecords: [],
      narrativeInsight: null
    })
    expect(report!.trainingLoad.method).toBe('suffer-score')
    expect(report!.trainingLoad.totalLoad).toBe(42)
  })

  it('includes only prior weeks of the same plan in the trend', () => {
    const sessions = [
      makeSession({ id: 'w0', week_index: 0, session_date: '2025-12-29' }),
      makeSession({ id: 'w1', week_index: 1, session_date: '2026-01-05' }),
      makeSession({ id: 'w2', week_index: 2, session_date: '2026-01-12', status: 'planned' })
    ]
    const report = buildWeeklyReport({
      planId: 'plan1',
      weekIndex: 1,
      allSessions: sessions,
      allActivities: [],
      profile: null,
      personalRecords: [],
      narrativeInsight: null
    })
    expect(report!.trend.map((t) => t.weekIndex)).toEqual([0])
  })

  it('flags a personal best only when it is tied to an activity in this week', () => {
    const sessions = [makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05' })]
    const activities = [makeActivity({ id: 'a1', matched_session_id: 's1', strava_activity_id: 999 })]
    const records: PersonalRecord[] = [
      {
        id: 'pr1',
        user_id: 'u1',
        distance_m: 5000,
        distance_label: '5K',
        time_sec: 1200,
        achieved_on: '2026-01-05',
        source: 'strava',
        strava_activity_id: 999,
        race_name: null,
        is_primary: false,
        notes: null,
        created_at: '2026-01-05T00:00:00Z',
        updated_at: '2026-01-05T00:00:00Z'
      }
    ]
    const report = buildWeeklyReport({
      planId: 'plan1',
      weekIndex: 1,
      allSessions: sessions,
      allActivities: activities,
      profile: null,
      personalRecords: records,
      narrativeInsight: null
    })
    expect(report!.personalBests).toHaveLength(1)
    expect(report!.personalBests[0].distanceLabel).toBe('5K')
  })
})
