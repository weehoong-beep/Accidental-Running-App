import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths
} from 'date-fns'
import { useNavigate } from 'react-router-dom'
import type { TrainingSession } from '@/lib/types'
import { sessionTypeInfo } from '@/lib/higdon'
import { metersToKm } from '@/lib/format'
import { findCurrentWeek, groupSessionsByWeek } from '@/lib/stats'
import { shiftDateString, todayMY } from '@/lib/timezone'

/**
 * Collapsed: current training week as a title/subtitle + 7-day strip (what the
 * Dashboard showed before). Expanded: the full month calendar (the old
 * standalone Calendar page), merged in here instead of living on its own tab.
 */
export function WeekCalendarCard({ sessions }: { sessions: TrainingSession[] }) {
  const navigate = useNavigate()
  const todayStr = todayMY()
  const [expanded, setExpanded] = useState(false)
  const [month, setMonth] = useState(() => new Date(todayStr + 'T00:00:00'))
  const [selected, setSelected] = useState<string | null>(null)

  const weeks = useMemo(() => groupSessionsByWeek(sessions), [sessions])
  const currentWeek = useMemo(() => findCurrentWeek(weeks, todayStr), [weeks, todayStr])

  const weekDays = useMemo(() => {
    if (!currentWeek?.startDate) return []
    return Array.from({ length: 7 }, (_, i) => {
      const dateStr = shiftDateString(currentWeek.startDate!, i)
      return { dateStr, session: currentWeek.sessions.find((s) => s.session_date === dateStr) }
    })
  }, [currentWeek])

  const byDate = useMemo(() => {
    const map = new Map<string, TrainingSession>()
    sessions.forEach((s) => map.set(s.session_date, s))
    return map
  }, [sessions])

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const selectedSession = selected ? byDate.get(selected) : null

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full p-4 text-left">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold">Week {currentWeek?.week ?? '—'}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {currentWeek?.startDate && format(new Date(currentWeek.startDate + 'T00:00:00'), 'MMM d')}
              {currentWeek?.endDate && ` – ${format(new Date(currentWeek.endDate + 'T00:00:00'), 'MMM d')}`}
            </p>
          </div>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {!expanded && (
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {weekDays.map(({ dateStr, session }) => {
              const isToday = dateStr === todayStr
              const info = session ? sessionTypeInfo(session.session_type) : null
              const d = new Date(dateStr + 'T00:00:00')
              return (
                <div
                  key={dateStr}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (session) navigate(`/session/${session.id}`)
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2 ${
                    isToday ? 'bg-white/10 ring-1 ring-white/20' : 'bg-white/[0.03]'
                  }`}
                >
                  <span className="text-[10px] text-slate-400">{format(d, 'EEEEE')}</span>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: info?.color ?? 'rgba(255,255,255,0.15)' }} />
                  <span className="text-[11px] font-semibold">{format(d, 'd')}</span>
                </div>
              )
            })}
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="month"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 p-4 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{format(month, 'MMMM yyyy')}</p>
                <div className="flex gap-2">
                  <button onClick={() => setMonth((m) => subMonths(m, 1))} className="rounded-lg bg-white/5 p-1.5">
                    <ChevronLeft />
                  </button>
                  <button onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded-lg bg-white/5 p-1.5">
                    <ChevronRight />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {monthDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const session = byDate.get(dateStr)
                  const info = session ? sessionTypeInfo(session.session_type) : null
                  const inMonth = isSameMonth(day, month)
                  const isToday = dateStr === todayStr
                  const isSelected = selected === dateStr

                  return (
                    <motion.button
                      key={dateStr}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSelected(dateStr)}
                      className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs ${
                        isSelected ? 'bg-white/15 ring-1 ring-white/25' : isToday ? 'bg-white/8' : ''
                      } ${inMonth ? 'text-slate-200' : 'text-slate-600'}`}
                    >
                      {day.getDate()}
                      {info && session?.session_type !== 'rest' && (
                        <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info.color }} />
                      )}
                    </motion.button>
                  )
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(['easy', 'tempo', 'interval', 'long', 'cross_train', 'race'] as const).map((t) => {
                  const info = sessionTypeInfo(t)
                  return (
                    <span key={t} className="pill bg-white/5 text-[10px] text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info.color }} />
                      {info.short}
                    </span>
                  )
                })}
              </div>

              {selectedSession && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/session/${selectedSession.id}`)}
                  className="card mt-4 w-full p-4 text-left"
                >
                  <p className="text-xs text-slate-400">{format(new Date(selected! + 'T00:00:00'), 'EEEE, MMM d')}</p>
                  <p className="mt-1 font-semibold">{selectedSession.title || sessionTypeInfo(selectedSession.session_type).label}</p>
                  {selectedSession.planned_distance_m && (
                    <p className="mt-0.5 text-xs text-slate-400">{metersToKm(selectedSession.planned_distance_m)} km planned</p>
                  )}
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
