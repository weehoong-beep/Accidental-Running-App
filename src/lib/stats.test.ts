import { describe, expect, it } from 'vitest'
import { groupSessionsByWeek } from './stats'
import type { TrainingSession } from './types'

function makeSession(overrides: Partial<TrainingSession> & { id: string; week_index: number; session_date: string }): TrainingSession {
  return {
    user_id: 'u1',
    plan_id: 'plan1',
    day_index: 0,
    session_type: 'easy',
    title: null,
    planned_distance_m: 5000,
    planned_duration_sec: 1800,
    target_pace_min_sec: null,
    target_pace_max_sec: null,
    target_hr_zone: null,
    structured_steps: null,
    description: null,
    status: 'planned',
    actual_distance_m: null,
    actual_duration_sec: null,
    original_session_date: null,
    swapped_with_session_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

describe('groupSessionsByWeek', () => {
  it('marks a week complete once every runnable session is done, ignoring rest days entirely', () => {
    const sessions = [
      makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05', status: 'completed' }),
      makeSession({ id: 's2', week_index: 1, session_date: '2026-01-06', session_type: 'rest', planned_distance_m: null, status: 'planned' })
    ]
    const [week] = groupSessionsByWeek(sessions)
    expect(week.completed).toBe(1)
    expect(week.runnable).toBe(1)
    expect(week.isCompleted).toBe(true)
  })

  it('does not let a rest day marked completed push completed above runnable', () => {
    // Regression: a rest day can be marked 'completed' via the same UI flow as
    // any other session (e.g. logging a cross-training activity on it). That
    // must not count against the runnable total, or the week could never
    // register as fully done even once every real run is complete.
    const sessions = [
      makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05', status: 'completed' }),
      makeSession({ id: 's2', week_index: 1, session_date: '2026-01-06', session_type: 'rest', planned_distance_m: null, status: 'completed' })
    ]
    const [week] = groupSessionsByWeek(sessions)
    expect(week.completed).toBe(1)
    expect(week.runnable).toBe(1)
    expect(week.isCompleted).toBe(true)
  })

  it('is not completed while any runnable session remains unfinished', () => {
    const sessions = [
      makeSession({ id: 's1', week_index: 1, session_date: '2026-01-05', status: 'completed' }),
      makeSession({ id: 's2', week_index: 1, session_date: '2026-01-06', status: 'planned' })
    ]
    const [week] = groupSessionsByWeek(sessions)
    expect(week.completed).toBe(1)
    expect(week.runnable).toBe(2)
    expect(week.isCompleted).toBe(false)
  })
})
