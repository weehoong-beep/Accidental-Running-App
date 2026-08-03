import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import type { Activity, TrainingPlan, TrainingSession } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import {
  useActivities,
  useAnalyzeBlock,
  useAnalyzeRun,
  useInsights,
  useProfile,
  useSessions,
  useStravaConnection,
  useStravaSync
} from '@/lib/queries'
import { durationToString, metersToKm, paceToString } from '@/lib/format'
import { BarChart, type BarGroup } from '@/components/charts/BarChart'
import { LineChart, type LinePoint } from '@/components/charts/LineChart'
import { PageTransition } from '@/components/layout/PageTransition'

export function Training({ plan }: { plan: TrainingPlan }) {
  const { user } = useAuth()
  const { data: activities = [], isLoading } = useActivities(user?.id)
  const { data: insights = [] } = useInsights(user?.id)
  const { data: connection } = useStravaConnection(user?.id)
  const stravaSync = useStravaSync()
  const analyzeRun = useAnalyzeRun()
  const analyzeBlock = useAnalyzeBlock()
  const [expanded, setExpanded] = useState<string | null>(null)

  const blockInsight = insights.find((i) => i.kind === 'block' && i.plan_id === plan.id)

  if (!connection?.athlete_id) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center px-6 pt-24 text-center">
          <div className="mb-4 h-14 w-14 rounded-2xl bg-[#FC4C02]/20" />
          <p className="font-semibold">Connect Strava to see your runs</p>
          <p className="mt-1 text-sm text-slate-400">Head to Settings to connect your Strava account.</p>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="px-5 pt-6 safe-top">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">Your Runs</h1>
          <button
            onClick={() => stravaSync.mutate()}
            disabled={stravaSync.isPending}
            className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          >
            {stravaSync.isPending ? 'Syncing…' : 'Sync'}
          </button>
        </div>

        <Trends plan={plan} activities={activities} />

        {/* Block-level analysis */}
        <div className="card mt-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Training block analysis</p>
            <button
              onClick={() => analyzeBlock.mutate(plan.id)}
              disabled={analyzeBlock.isPending}
              className="rounded-lg bg-accent-purple/20 px-2.5 py-1 text-[11px] font-medium text-accent-purple disabled:opacity-60"
            >
              {analyzeBlock.isPending ? 'Analyzing…' : blockInsight ? 'Refresh' : 'Generate'}
            </button>
          </div>
          {blockInsight ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{blockInsight.content}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No analysis yet — generate one once you have a few synced runs.</p>
          )}
        </div>

        {/* Runs list */}
        <div className="mt-4 space-y-3">
          {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {!isLoading && activities.length === 0 && (
            <div className="card p-4 text-center text-sm text-slate-500">No runs synced yet. Tap Sync to pull from Strava.</div>
          )}
          {activities.map((a) => {
            const runInsight = insights.find((i) => i.kind === 'run' && i.activity_id === a.id)
            const isOpen = expanded === a.id
            return (
              <motion.div key={a.id} layout className="card p-4">
                <button className="w-full text-left" onClick={() => setExpanded(isOpen ? null : a.id)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">
                        {a.local_date && format(new Date(a.local_date + 'T00:00:00'), 'EEE, MMM d')}
                      </p>
                      <p className="font-semibold">{a.name}</p>
                    </div>
                    <MatchBadge status={a.match_status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {metersToKm(a.distance_m)} km · {durationToString(a.moving_time_sec)} · {paceToString(a.average_pace_sec_per_km)}
                    {a.average_heartrate ? ` · ${Math.round(a.average_heartrate)} bpm` : ''}
                  </p>
                </button>

                {isOpen && (
                  <div className="mt-3 border-t border-white/5 pt-3">
                    {runInsight ? (
                      <p className="whitespace-pre-line text-sm text-slate-300">{runInsight.content}</p>
                    ) : (
                      <button
                        onClick={() => analyzeRun.mutate(a.id)}
                        disabled={analyzeRun.isPending}
                        className="w-full rounded-lg bg-accent-purple/20 py-2 text-xs font-medium text-accent-purple disabled:opacity-60"
                      >
                        {analyzeRun.isPending ? 'Analyzing…' : 'Get AI analysis for this run'}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </PageTransition>
  )
}

/**
 * Weekly volume against plan, and how easy-run pace is drifting relative to the
 * runner's own easy range.
 */
function Trends({ plan, activities }: { plan: TrainingPlan; activities: Activity[] }) {
  const { user } = useAuth()
  const { data: sessions = [] } = useSessions(plan.id)
  const { data: profile } = useProfile(user?.id)

  const weeks = useMemo<BarGroup[]>(() => {
    const byWeek = new Map<number, { planned: number; actual: number }>()
    for (const s of sessions as TrainingSession[]) {
      if (s.session_type === 'rest') continue
      const entry = byWeek.get(s.week_index) ?? { planned: 0, actual: 0 }
      entry.planned += (s.planned_distance_m ?? 0) / 1000
      if (s.status === 'completed') entry.actual += (s.actual_distance_m ?? s.planned_distance_m ?? 0) / 1000
      byWeek.set(s.week_index, entry)
    }
    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, v]) => ({ label: `W${week}`, planned: v.planned, actual: v.actual }))
  }, [sessions])

  // Only runs matched to an easy or long session belong on an easy-pace trend;
  // tempo and interval days would swamp the signal.
  const easySessionIds = useMemo(
    () =>
      new Set(
        (sessions as TrainingSession[])
          .filter((s) => s.session_type === 'easy' || s.session_type === 'long')
          .map((s) => s.id)
      ),
    [sessions]
  )

  const easyPacePoints = useMemo<LinePoint[]>(
    () =>
      activities
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
        })),
    [activities, easySessionIds]
  )

  const easyBand =
    profile?.easy_pace_min_sec && profile?.easy_pace_max_sec
      ? { from: profile.easy_pace_min_sec, to: profile.easy_pace_max_sec }
      : null

  const totalActual = weeks.reduce((sum, w) => sum + w.actual, 0)

  return (
    <div className="card mt-4 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trends</p>

      {weeks.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No sessions in this plan yet.</p>
      ) : (
        <>
          <p className="mt-2 mb-2 text-xs text-slate-400">
            Weekly volume · {totalActual.toFixed(1)} km logged so far
          </p>
          <BarChart data={weeks} unit=" km" />
        </>
      )}

      <div className="mt-5 border-t border-white/5 pt-4">
        <p className="mb-2 text-xs text-slate-400">
          Easy-run pace
          {easyBand ? ' — shaded band is your easy range' : ' — set your paces to see your target band'}
        </p>
        {easyPacePoints.length < 2 ? (
          <p className="text-sm text-slate-500">
            Needs at least two easy or long runs matched to your plan.
          </p>
        ) : (
          <LineChart
            points={easyPacePoints}
            band={easyBand}
            invertY
            formatY={(v) => paceToString(Math.round(v))}
          />
        )}
      </div>
    </div>
  )
}

function MatchBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    matched: 'bg-emerald-500/15 text-emerald-300',
    partial: 'bg-amber-500/15 text-amber-300',
    unmatched: 'bg-white/5 text-slate-400'
  }
  const label: Record<string, string> = {
    matched: 'Matched plan',
    partial: 'Partial match',
    unmatched: 'Unmatched'
  }
  const key = status ?? 'unmatched'
  return <span className={`pill ${map[key] ?? map.unmatched}`}>{label[key] ?? 'Unmatched'}</span>
}
