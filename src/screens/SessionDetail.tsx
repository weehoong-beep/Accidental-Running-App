import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { useSession, useActivities, useInsights } from '@/lib/queries'
import { sessionTypeInfo } from '@/lib/higdon'
import { durationToString, metersToKm, paceRangeToString, paceToString } from '@/lib/format'
import { SessionTypeIcon } from '@/components/SessionTypeIcon'
import { PageTransition } from '@/components/layout/PageTransition'
import { SessionActionsSheet } from '@/components/SessionActionsSheet'
import { useAuth } from '@/context/AuthContext'

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
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Synced from Strava</p>
            <p className="mt-1 font-semibold">{matchedActivity.name}</p>
            <p className="text-xs text-slate-400">
              {metersToKm(matchedActivity.distance_m)} km · {paceToString(matchedActivity.average_pace_sec_per_km)}
              {matchedActivity.average_heartrate ? ` · ${Math.round(matchedActivity.average_heartrate)} bpm avg` : ''}
            </p>
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
