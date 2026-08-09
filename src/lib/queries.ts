import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { buildWeeklyReport } from './weeklyReport'
import type {
  Activity,
  ActivityDetail,
  Insight,
  IntegrationSettings,
  PersonalRecord,
  Profile,
  RaceEvent,
  StravaConnection,
  TrainingPlan,
  TrainingSession
} from './types'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authedHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

export async function callFunction<T = any>(name: string, body?: Record<string, unknown>): Promise<T> {
  const headers = await authedHeaders()
  const res = await fetch(`${FN_URL}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {})
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error ?? `${name} failed (${res.status})`)
  return json
}

// ---------- Profile ----------
export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).single()
      if (error) throw error
      return data as Profile
    }
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, ...patch }: Partial<Profile> & { userId: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] })
  })
}

// ---------- Personal records ----------
export function usePersonalRecords(userId?: string) {
  return useQuery({
    queryKey: ['personal-records', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personal_records')
        .select('*')
        .eq('user_id', userId!)
        .order('distance_m', { ascending: true })
      if (error) throw error
      return data as PersonalRecord[]
    }
  })
}

export function useSavePersonalRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (record: Partial<PersonalRecord> & { user_id: string }) => {
      // One hand-entered record per distance, so re-saving the same distance
      // replaces it rather than stacking a second row.
      const { error } = await supabase
        .from('personal_records')
        .upsert(
          { ...record, source: record.source ?? 'manual', updated_at: new Date().toISOString() },
          { onConflict: 'user_id,distance_m,source', ignoreDuplicates: false }
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personal-records'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
    }
  })
}

export function useDeletePersonalRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('personal_records').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personal-records'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
    }
  })
}

/** Marks one record as the basis for derived paces, clearing the flag on the rest. */
export function useSetPrimaryRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, id }: { userId: string; id: string }) => {
      const { error: clearErr } = await supabase
        .from('personal_records')
        .update({ is_primary: false })
        .eq('user_id', userId)
        .neq('id', id)
      if (clearErr) throw clearErr
      const { error } = await supabase
        .from('personal_records')
        .update({ is_primary: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personal-records'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
    }
  })
}

// ---------- Active plan + race ----------
export function useActivePlan(userId?: string) {
  return useQuery({
    queryKey: ['active-plan', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', userId!)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as TrainingPlan | null
    }
  })
}

export function useRaceEvent(raceEventId?: string | null) {
  return useQuery({
    queryKey: ['race-event', raceEventId],
    enabled: !!raceEventId,
    queryFn: async () => {
      const { data, error } = await supabase.from('race_events').select('*').eq('id', raceEventId!).single()
      if (error) throw error
      return data as RaceEvent
    }
  })
}

// ---------- Sessions ----------
export function useSessions(planId?: string) {
  return useQuery({
    queryKey: ['sessions', planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('plan_id', planId!)
        .order('session_date', { ascending: true })
      if (error) throw error
      return data as TrainingSession[]
    }
  })
}

export function useSession(sessionId?: string) {
  return useQuery({
    queryKey: ['session', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('id', sessionId!)
        .single()
      if (error) throw error
      return data as TrainingSession
    }
  })
}

/**
 * Exchanges the dates (and original-date bookkeeping) between two sessions.
 * Dropping an activity onto a rest day works the same way — the rest day
 * moves to the activity's old date, which is effectively a reschedule.
 */
export function useSwapSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ aId, bId }: { aId: string; bId: string }) => {
      const { data: rows, error } = await supabase
        .from('training_sessions')
        .select('id, session_date, original_session_date')
        .in('id', [aId, bId])
      if (error) throw error
      const a = rows.find((r) => r.id === aId)!
      const b = rows.find((r) => r.id === bId)!
      const { error: e1 } = await supabase
        .from('training_sessions')
        .update({
          session_date: b.session_date,
          original_session_date: a.original_session_date ?? a.session_date,
          status: 'swapped',
          swapped_with_session_id: bId
        })
        .eq('id', aId)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('training_sessions')
        .update({
          session_date: a.session_date,
          original_session_date: b.original_session_date ?? b.session_date,
          status: 'swapped',
          swapped_with_session_id: aId
        })
        .eq('id', bId)
      if (e2) throw e2
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
    }
  })
}

export function useMarkSessionStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      actualDistanceM,
      actualDurationSec
    }: {
      id: string
      status: 'completed' | 'planned' | 'missed'
      actualDistanceM?: number | null
      actualDurationSec?: number | null
    }) => {
      const { error } = await supabase
        .from('training_sessions')
        .update({
          status,
          actual_distance_m: actualDistanceM ?? null,
          actual_duration_sec: actualDurationSec ?? null
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['session'] })
    }
  })
}

// ---------- Strava ----------
export function useStravaConnection(userId?: string) {
  return useQuery({
    queryKey: ['strava-connection', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_connections')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data as StravaConnection | null
    }
  })
}

export function useIntegrationSettings(userId?: string) {
  return useQuery({
    queryKey: ['integration-settings', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data as IntegrationSettings | null
    }
  })
}

export function useSaveIntegrationSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<IntegrationSettings> & { user_id: string }) => {
      const { error } = await supabase.from('integration_settings').upsert(payload)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration-settings'] })
  })
}

export function useStravaSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => callFunction('strava-sync'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['strava-connection'] })
    }
  })
}

export function useStravaDisconnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('strava_connections').delete().eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strava-connection'] })
  })
}

// ---------- Activities & Insights ----------
export function useActivities(userId?: string) {
  return useQuery({
    queryKey: ['activities', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', userId!)
        .order('local_date', { ascending: false })
      if (error) throw error
      return data as Activity[]
    }
  })
}

/** The Strava detail payload (splits, laps, best efforts) merged into `raw`. */
export function useActivityDetail(activityId?: string | null) {
  return useQuery({
    queryKey: ['activity-detail', activityId],
    enabled: !!activityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('raw, fetched_detail_at')
        .eq('id', activityId!)
        .single()
      if (error) throw error
      return {
        detail: (data.raw ?? {}) as ActivityDetail,
        fetchedAt: data.fetched_detail_at as string | null
      }
    }
  })
}

export function useInsights(userId?: string) {
  return useQuery({
    queryKey: ['insights', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insights')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Insight[]
    }
  })
}

export function useAnalyzeRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (activityId: string) => callFunction('analyze-run', { activity_id: activityId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] })
  })
}

export function useAnalyzeBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (planId: string) => callFunction('analyze-block', { plan_id: planId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] })
  })
}

export function useAnalyzeWeek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ planId, weekIndex }: { planId: string; weekIndex: number }) =>
      callFunction('analyze-week', { plan_id: planId, week_index: weekIndex }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] })
  })
}

/**
 * Fetches Strava's per-point GPS/elevation/heart-rate stream for whichever of
 * `activityIds` don't already have it cached on `activities.stream_data`, so
 * the Weekly Report's 3D route ribbon can render at full fidelity. Scoped to
 * one week's activities and called only when a report is opened, rather than
 * during general sync, to keep Strava API usage bounded to weeks people
 * actually view.
 */
export function useWeekStreams(activityIds: string[]) {
  const qc = useQueryClient()
  const key = ['activity-streams', ...[...activityIds].sort()]
  return useQuery({
    queryKey: key,
    enabled: activityIds.length > 0,
    queryFn: async () => {
      const { data: existing, error } = await supabase
        .from('activities')
        .select('id, stream_data')
        .in('id', activityIds)
      if (error) throw error

      const missing = (existing ?? []).filter((a) => !a.stream_data).map((a) => a.id)
      if (missing.length > 0) {
        await callFunction('fetch-week-streams', { activity_ids: missing })
        qc.invalidateQueries({ queryKey: ['activities'] })
      }

      const { data: fresh, error: freshErr } = await supabase
        .from('activities')
        .select('id, stream_data')
        .in('id', activityIds)
      if (freshErr) throw freshErr
      return fresh ?? []
    }
  })
}

/**
 * The Weekly Running Report for one completed week — hero stats, technical
 * analysis, and 3D route-ribbon data. A composition hook: it issues no query
 * of its own beyond the stream fetch, instead assembling already-cached
 * sessions/activities/profile/records/insights via `buildWeeklyReport`.
 */
export function useWeeklyReport(
  planId: string | undefined,
  weekIndex: number | undefined,
  userId: string | undefined,
  raceEvent: RaceEvent | null = null
) {
  const sessionsQ = useSessions(planId)
  const activitiesQ = useActivities(userId)
  const profileQ = useProfile(userId)
  const recordsQ = usePersonalRecords(userId)
  const insightsQ = useInsights(userId)

  const weekActivityIds = useMemo(() => {
    if (weekIndex == null) return []
    return (sessionsQ.data ?? [])
      .filter((s) => s.week_index === weekIndex)
      .map((s) => (activitiesQ.data ?? []).find((a) => a.matched_session_id === s.id)?.id)
      .filter((id): id is string => !!id)
  }, [sessionsQ.data, activitiesQ.data, weekIndex])

  const streamsQ = useWeekStreams(weekActivityIds)

  const data = useMemo(() => {
    if (planId == null || weekIndex == null) return undefined
    if (!sessionsQ.data || !activitiesQ.data) return undefined
    const narrativeInsight =
      insightsQ.data?.find((i) => i.kind === 'week' && i.plan_id === planId && i.week_index === weekIndex) ?? null
    return buildWeeklyReport({
      planId,
      weekIndex,
      allSessions: sessionsQ.data,
      allActivities: activitiesQ.data,
      profile: profileQ.data ?? null,
      personalRecords: recordsQ.data ?? [],
      raceEvent,
      narrativeInsight
    })
    // `streamsQ.data` isn't read directly (buildWeeklyReport re-reads
    // `activitiesQ.data`, which is invalidated once streams land) — it's a
    // dependency purely so this recomputes once the fetch finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, weekIndex, sessionsQ.data, activitiesQ.data, profileQ.data, recordsQ.data, insightsQ.data, streamsQ.data, raceEvent])

  return {
    data,
    isLoading: sessionsQ.isLoading || activitiesQ.isLoading || profileQ.isLoading || recordsQ.isLoading,
    isFetchingStreams: streamsQ.isFetching,
    error: sessionsQ.error || activitiesQ.error
  }
}

/**
 * Rewrites pace and HR-zone targets on every session of the active plan from the
 * current profile, and flags any AI analyses that were written against the old
 * targets. Returns `{ updated, staleInsights }`.
 */
export function useRecalcPlanPaces() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (planId: string) =>
      callFunction<{ updated: number; staleInsights: number }>('recalc-plan-paces', {
        plan_id: planId
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['session'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    }
  })
}

export function useSeedPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => callFunction('seed-plan'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-plan'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['race-event'] })
    }
  })
}
