import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { useActivities, useActivityDetail, useInsights, useSession } from '@/lib/queries'
import type { ActivityLap, TrainingSession } from '@/lib/types'
import { sessionTypeInfo } from '@/lib/higdon'
import { durationToString, metersToKm, paceRangeToString, paceToString } from '@/lib/format'
import { SessionTypeIcon } from '@/components/SessionTypeIcon'
import { RouteIcon } from '@/components/RouteIcon'
import { PageTransition } from '@/components/layout/PageTransition'
import { SessionActionsSheet } from '@/components/SessionActionsSheet'
import { useAuth } from '@/context/AuthContext'
import { getSummaryPolyline } from '@/lib/polyline'

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  missed: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
  rescheduled: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  planned: 'bg-white/5 text-slate-400 border-white/10'
}

export function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: session, isLoading } = useSession(id)
  const { data: activities = [] } = useActivities(user?.id)
  const { data: insights = [] } = useInsights(user?.id)
  const [sheetOpen, setSheetOpen] = useState(false)

  if (isLoading || !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent-purple" />
      </div>
    )
  }

  const info = sessionTypeInfo(session.session_type)
  const matchedActivity = activities.find((a) => a.matched_session_id === session.id)
  const runInsight = insights.find((i) => i.kind === 'run' && i.session_id === session.id)

  return (
    <PageTransition>
      <div className="px-5 pt-6 safe-top">
        <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm text-slate-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        <motion.div
          layoutId={`session-${session.id}`}
          className={`rounded-3xl bg-gradient-to-br ${info.gradient} p-5`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-300">{format(new Date(session.session_date + 'T00:00:00'), 'EEEE, MMMM d')}</p>
              <h1 className="mt-1 text-2xl font-extrabold">{session.title || info.label}</h1>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/25">
              <SessionTypeIcon type={session.session_type} className="h-6 w-6" />
            </div>
          </div>
          <span className={`pill mt-3 border ${STATUS_STYLE[session.status]}`}>{session.status}</span>
        </motion.div>

        {/* Stats */}
        {session.session_type !== 'rest' && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Distance" value={session.planned_distance_m ? `${metersToKm(session.planned_distance_m)} km` : '—'} />
            <Stat
              label="Pace target"
              value={paceRangeToString(session.target_pace_min_sec, session.target_pace_max_sec)}
            />
            <Stat label="Duration" value={session.planned_duration_sec ? durationToString(session.planned_duration_sec) : '—'} />
            <Stat label="HR zone" value={session.target_hr_zone ?? '—'} />
          </div>
        )}

        {/* Structured steps */}
        {session.structured_steps && session.structured_steps.length > 0 && (
          <div className="card mt-4 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Workout structure</p>
            <div className="space-y-2">
              {session.structured_steps.map((step, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span>
                    {step.repeat ? `${step.repeat}× ` : ''}
                    {step.label}
                  </span>
                  <span className="text-slate-400">
                    {step.pace_sec_per_km ? paceToString(step.pace_sec_per_km) : ''}
                    {step.recovery ? ` · rec: ${step.recovery}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Higdon guidance */}
        <div className="card mt-4 space-y-3 p-4">
          <GuideRow label="What it is" text={info.what} />
          <GuideRow label="Why it's here" text={info.why} />
          <GuideRow label="How to run it" text={info.howTo} />
        </div>

        {/* Linked Strava activity */}
        {matchedActivity && (
          <div className="card mt-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Synced from Strava</p>
                <p className="mt-1 font-semibold">{matchedActivity.name}</p>
                <p className="text-xs text-slate-400">
                  {metersToKm(matchedActivity.distance_m)} km · {paceToString(matchedActivity.average_pace_sec_per_km)}
                  {matchedActivity.average_heartrate ? ` · ${Math.round(matchedActivity.average_heartrate)} bpm avg` : ''}
                </p>
              </div>
              {getSummaryPolyline(matchedActivity) && (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/5">
                  <RouteIcon polyline={getSummaryPolyline(matchedActivity)} className="h-12 w-12" strokeColor="#2DD4BF" />
                </div>
              )}
            </div>
            {runInsight && (
              <div className="mt-3 rounded-xl bg-accent-purple/10 border border-accent-purple/20 p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent-purple">AI analysis</p>
                <p className="text-sm text-slate-200 whitespace-pre-line">{runInsight.content}</p>
              </div>
            )}
          </div>
        )}

        {session.status === 'completed' && session.actual_distance_m != null && (
          <div className="card mt-4 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actual</p>
            <p className="mt-1 text-sm">{metersToKm(session.actual_distance_m)} km completed</p>
          </div>
        )}

        {matchedActivity && <SplitsAndLaps session={session} activityId={matchedActivity.id} />}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setSheetOpen(true)}
          className="mt-5 mb-8 w-full rounded-xl bg-white/8 py-3 text-sm font-semibold"
        >
          Reschedule, swap, or mark complete
        </motion.button>
      </div>

      {sheetOpen && <SessionActionsSheet session={session} onClose={() => setSheetOpen(false)} />}
    </PageTransition>
  )
}

/** Session types where the rep-by-rep lap breakdown is the more useful view. */
const LAP_FIRST_TYPES = new Set(['interval', 'tempo', 'race_pace'])

/**
 * Per-kilometre splits and lap breakdown from the Strava detail payload, which
 * `strava-sync` merges into `activities.raw`.
 */
function SplitsAndLaps({
  session,
  activityId
}: {
  session: TrainingSession
  activityId: string
}) {
  const { data } = useActivityDetail(activityId)
  const [open, setOpen] = useState(false)

  const splits = data?.detail.splits_metric ?? []
  // Strava emits one lap covering the whole run when there is no structure to
  // show, which duplicates the summary already above.
  const allLaps = data?.detail.laps ?? []
  const laps = allLaps.length > 1 ? allLaps : []

  if (splits.length === 0 && laps.length === 0) {
    // Detail either has not been fetched yet or the run predates it.
    if (data && !data.fetchedAt) {
      return (
        <div className="card mt-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Splits</p>
          <p className="mt-1 text-sm text-slate-500">
            Not pulled yet — hit Sync in Settings to fetch this run's splits from Strava.
          </p>
        </div>
      )
    }
    return null
  }

  const showLapsFirst = LAP_FIRST_TYPES.has(session.session_type) && laps.length > 0
  const targetMin = session.target_pace_min_sec
  const targetMax = session.target_pace_max_sec ?? targetMin

  const paces = splits
    .map((s) => (s.average_speed > 0 ? 1000 / s.average_speed : 0))
    .filter((p) => p > 0)
  const slowest = paces.length ? Math.max(...paces) : 0

  return (
    <div className="card mt-4 p-4">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen(!open)}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {showLapsFirst ? 'Laps & splits' : 'Splits'}
        </p>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {showLapsFirst && <LapTable laps={laps} />}

          {splits.length > 0 && (
            <div>
              {showLapsFirst && (
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Per kilometre
                </p>
              )}
              <div className="space-y-1">
                {splits.map((split) => {
                  const pace = split.average_speed > 0 ? 1000 / split.average_speed : 0
                  const gap =
                    split.average_grade_adjusted_speed && split.average_grade_adjusted_speed > 0
                      ? 1000 / split.average_grade_adjusted_speed
                      : null
                  // Faster splits get a longer bar.
                  const width = slowest > 0 && pace > 0 ? (slowest / pace) * 100 : 0
                  const onTarget =
                    targetMin != null && targetMax != null
                      ? pace <= targetMax + 10 && pace >= targetMin - 20
                      : null
                  const partial = split.distance < 900

                  return (
                    <div key={split.split} className="flex items-center gap-2 text-xs">
                      <span className="w-5 shrink-0 text-slate-500">{split.split}</span>
                      <div className="relative h-5 flex-1 overflow-hidden rounded bg-white/5">
                        <div
                          className={`h-full rounded ${
                            onTarget === null
                              ? 'bg-white/15'
                              : onTarget
                                ? 'bg-emerald-500/30'
                                : 'bg-amber-500/30'
                          }`}
                          style={{ width: `${Math.min(100, width)}%` }}
                        />
                        <span className="absolute inset-y-0 left-2 flex items-center font-medium">
                          {paceToString(Math.round(pace))}
                          {partial && (
                            <span className="ml-1 text-slate-500">
                              ({metersToKm(split.distance, 2)} km)
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="w-24 shrink-0 text-right text-slate-400">
                        {gap && Math.abs(gap - pace) > 3 ? `GAP ${paceToString(Math.round(gap))}` : ''}
                        {split.average_heartrate
                          ? ` ${Math.round(split.average_heartrate)}bpm`
                          : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              {targetMin != null && (
                <p className="mt-2 text-[10px] text-slate-500">
                  Green splits landed in your target range of{' '}
                  {paceRangeToString(targetMin, targetMax)}.
                </p>
              )}
            </div>
          )}

          {!showLapsFirst && laps.length > 0 && <LapTable laps={laps} />}
        </div>
      )}
    </div>
  )
}

function LapTable({ laps }: { laps: ActivityLap[] }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Laps
      </p>
      <div className="space-y-1">
        {laps.map((lap) => {
          const pace = lap.average_speed > 0 ? 1000 / lap.average_speed : 0
          return (
            <div
              key={lap.id}
              className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"
            >
              <span className="text-slate-300">{lap.name || `Lap ${lap.lap_index}`}</span>
              <span className="text-slate-400">
                {metersToKm(lap.distance, 2)} km · {durationToString(lap.moving_time)} ·{' '}
                {paceToString(Math.round(pace))}
                {lap.average_heartrate ? ` · ${Math.round(lap.average_heartrate)} bpm` : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  )
}

function GuideRow({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-accent-teal">{label}</p>
      <p className="mt-0.5 text-sm text-slate-300">{text}</p>
    </div>
  )
}
