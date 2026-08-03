import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths
} from 'date-fns'
import { useNavigate } from 'react-router-dom'
import type { TrainingPlan } from '@/lib/types'
import { useSessions } from '@/lib/queries'
import { sessionTypeInfo } from '@/lib/higdon'
import { PageTransition } from '@/components/layout/PageTransition'
import { metersToKm } from '@/lib/format'

export function Calendar({ plan }: { plan: TrainingPlan }) {
  const navigate = useNavigate()
  const { data: sessions = [] } = useSessions(plan.id)
  const [month, setMonth] = useState(new Date())
  const [selected, setSelected] = useState<string | null>(null)

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const byDate = useMemo(() => {
    const map = new Map<string, (typeof sessions)[number]>()
    sessions.forEach((s) => map.set(s.session_date, s))
    return map
  }, [sessions])

  const selectedSession = selected ? byDate.get(selected) : null

  return (
    <PageTransition>
      <div className="px-5 pt-6 safe-top">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">{format(month, 'MMMM yyyy')}</h1>
          <div className="flex gap-2">
            <button onClick={() => setMonth(subMonths(month, 1))} className="rounded-lg bg-white/5 p-2">
              <ChevronLeft />
            </button>
            <button onClick={() => setMonth(addMonths(month, 1))} className="rounded-lg bg-white/5 p-2">
              <ChevronRight />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const session = byDate.get(dateStr)
            const info = session ? sessionTypeInfo(session.session_type) : null
            const inMonth = isSameMonth(day, month)
            const isToday = isSameDay(day, new Date())
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
                  <span
                    className="absolute bottom-1 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: info.color }}
                  />
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
            className="card mt-5 w-full p-4 text-left"
          >
            <p className="text-xs text-slate-400">{format(new Date(selected! + 'T00:00:00'), 'EEEE, MMM d')}</p>
            <p className="mt-1 font-semibold">{selectedSession.title || sessionTypeInfo(selectedSession.session_type).label}</p>
            {selectedSession.planned_distance_m && (
              <p className="mt-0.5 text-xs text-slate-400">{metersToKm(selectedSession.planned_distance_m)} km planned</p>
            )}
          </motion.button>
        )}
      </div>
    </PageTransition>
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
