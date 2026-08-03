import { useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import type { TrainingPlan } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useActivities, useAnalyzeBlock, useAnalyzeRun, useInsights, useStravaConnection, useStravaSync } from '@/lib/queries'
import { durationToString, metersToKm, paceToString } from '@/lib/format'
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
