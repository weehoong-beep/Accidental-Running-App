import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { TrainingSession } from '@/lib/types'
import { sessionTypeInfo } from '@/lib/higdon'
import { SessionTypeIcon } from './SessionTypeIcon'
import { RouteIcon } from './RouteIcon'
import { formatWeekday, metersToKm, paceRangeToString } from '@/lib/format'

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  missed: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
  rescheduled: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  planned: 'bg-white/5 text-slate-400 border-white/10'
}

export function SessionCard({
  session,
  emphasize = false,
  dateLabel,
  routePolyline
}: {
  session: TrainingSession
  emphasize?: boolean
  dateLabel?: string
  /** Decoded from the matched Strava activity's summary polyline, if any. */
  routePolyline?: string | null
}) {
  const navigate = useNavigate()
  const info = sessionTypeInfo(session.session_type)

  return (
    <motion.button
      layoutId={`session-${session.id}`}
      onClick={() => navigate(`/session/${session.id}`)}
      whileTap={{ scale: 0.97 }}
      className={`w-full text-left card p-4 flex items-center gap-3 bg-gradient-to-br ${info.gradient} ${
        emphasize ? 'ring-1 ring-white/10 shadow-glow' : ''
      }`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/20">
        {routePolyline ? <RouteIcon polyline={routePolyline} className="h-8 w-8" /> : <SessionTypeIcon type={session.session_type} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-sm">{session.title || info.label}</p>
          <span className={`pill border ${STATUS_STYLE[session.status] ?? STATUS_STYLE.planned}`}>
            {session.status}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {dateLabel ?? formatWeekday(session.session_date)}
          {session.planned_distance_m ? ` · ${metersToKm(session.planned_distance_m)} km` : ''}
          {session.target_pace_min_sec ? ` · ${paceRangeToString(session.target_pace_min_sec, session.target_pace_max_sec)}` : ''}
        </p>
      </div>
      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.button>
  )
}
