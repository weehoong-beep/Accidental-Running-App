import type { Activity, SessionType, TrainingSession } from './types'
import type { BarGroup } from '@/components/charts/BarChart'
import type { LinePoint } from '@/components/charts/LineChart'

export interface WeekGroup {
  week: number
  sessions: TrainingSession[]
  startDate: string | undefined
  endDate: string | undefined
  km: number
  completed: number
  runnable: number
}

export function groupSessionsByWeek(sessions: TrainingSession[]): WeekGroup[] {
  const map = new Map<number, TrainingSession[]>()
  sessions.forEach((s) => {
    if (!map.has(s.week_index)) map.set(s.week_index, [])
    map.get(s.week_index)!.push(s)
  })
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, list]) => {
      const sorted = list.sort((a, b) => a.session_date.localeCompare(b.session_date))
      return {
        week,
        sessions: sorted,
        startDate: sorted[0]?.session_date,
        endDate: sorted[sorted.length - 1]?.session_date,
        km: sorted.reduce((sum, s) => sum + (s.planned_distance_m ?? 0), 0) / 1000,
        completed: sorted.filter((s) => s.status === 'completed').length,
        runnable: sorted.filter((s) => s.session_type !== 'rest').length
      }
    })
}

/** The week containing `todayStr`, else the nearest future week, else the last week. */
export function findCurrentWeek(weeks: WeekGroup[], todayStr: string): WeekGroup | undefined {
  if (weeks.length === 0) return undefined
  const containing = weeks.find((w) => !!w.startDate && !!w.endDate && todayStr >= w.startDate! && todayStr <= w.endDate!)
  if (containing) return containing
  const future = weeks.find((w) => !!w.startDate && w.startDate! > todayStr)
  return future ?? weeks[weeks.length - 1]
}

export function computeWeeklyVolume(sessions: TrainingSession[]): BarGroup[] {
  const byWeek = new Map<number, { planned: number; actual: number }>()
  for (const s of sessions) {
    if (s.session_type === 'rest') continue
    const entry = byWeek.get(s.week_index) ?? { planned: 0, actual: 0 }
    entry.planned += (s.planned_distance_m ?? 0) / 1000
    if (s.status === 'completed') entry.actual += (s.actual_distance_m ?? s.planned_distance_m ?? 0) / 1000
    byWeek.set(s.week_index, entry)
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, v]) => ({ label: `W${week}`, planned: v.planned, actual: v.actual }))
}

export function computeDistanceByType(sessions: TrainingSession[]): { type: SessionType; km: number }[] {
  const byType = new Map<SessionType, number>()
  for (const s of sessions) {
    if (s.session_type === 'rest' || s.status !== 'completed') continue
    const km = (s.actual_distance_m ?? s.planned_distance_m ?? 0) / 1000
    byType.set(s.session_type, (byType.get(s.session_type) ?? 0) + km)
  }
  return [...byType.entries()]
    .filter(([, km]) => km > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, km]) => ({ type, km }))
}

export function computeCompletionRate(sessions: TrainingSession[]): { completed: number; runnable: number } {
  const runnable = sessions.filter((s) => s.session_type !== 'rest')
  return { completed: runnable.filter((s) => s.status === 'completed').length, runnable: runnable.length }
}

/**
 * Only runs matched to an easy or long session belong on an easy-pace trend;
 * tempo and interval days would swamp the signal.
 */
export function computeEasyPacePoints(activities: Activity[], sessions: TrainingSession[]): LinePoint[] {
  const easySessionIds = new Set(
    sessions.filter((s) => s.session_type === 'easy' || s.session_type === 'long').map((s) => s.id)
  )
  return activities
    .filter(
      (a) =>
        a.average_pace_sec_per_km != null &&
        a.local_date != null &&
        a.matched_session_id != null &&
        easySessionIds.has(a.matched_session_id)
    )
    .map((a) => ({
      x: new Date(a.local_date + 'T00:00:00').getTime(),
      y: a.average_pace_sec_per_km as number
    }))
}
