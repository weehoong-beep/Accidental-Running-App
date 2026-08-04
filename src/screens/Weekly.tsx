import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import type { TrainingPlan } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useActivities, useSessions } from '@/lib/queries'
import { sessionTypeInfo } from '@/lib/higdon'
import { SessionCard } from '@/components/SessionCard'
import { PageTransition } from '@/components/layout/PageTransition'
import { groupSessionsByWeek } from '@/lib/stats'
import { buildPolylineMap } from '@/lib/polyline'
import { todayMY } from '@/lib/timezone'

export function Weekly({ plan }: { plan: TrainingPlan }) {
  const { user } = useAuth()
  const { data: sessions = [] } = useSessions(plan.id)
  const { data: activities = [] } = useActivities(user?.id)
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(new Set())
  const todayStr = todayMY()

  const weeks = useMemo(() => groupSessionsByWeek(sessions), [sessions])
  const polylineMap = useMemo(() => buildPolylineMap(activities), [activities])

  const toggleWeek = (week: number) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(week)) next.delete(week)
      else next.add(week)
      return next
    })
  }

  return (
    <PageTransition>
      <div className="px-5 pt-6 safe-top">
        <h1 className="text-xl font-extrabold">Weekly Plan</h1>
        <p className="mt-1 text-xs text-slate-400">
          {plan.weeks}-week block · {plan.methodology === 'higdon' ? 'Hal Higdon Intermediate 2' : plan.methodology}
        </p>

        <div className="mt-5 space-y-3">
          {weeks.map((w) => {
            const startDate = w.startDate
            const endDate = w.endDate
            const isCompleted = w.runnable > 0 && w.completed === w.runnable
            const isPast = !!endDate && endDate < todayStr
            const isOver = isCompleted || isPast
            const isOpen = openWeeks.has(w.week)

            return (
              <div key={w.week} className={`card overflow-hidden ${isOver ? 'bg-white/[0.02] opacity-60' : ''}`}>
                <button
                  onClick={() => toggleWeek(w.week)}
                  aria-expanded={isOpen}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">
                        {startDate && format(new Date(startDate + 'T00:00:00'), 'MMM d')} –{' '}
                        {endDate && format(new Date(endDate + 'T00:00:00'), 'MMM d')}
                      </p>
                      <p className={`font-bold ${isOver ? 'text-slate-400' : ''}`}>Week {w.week}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${isOver ? 'text-slate-400' : ''}`}>{w.km.toFixed(1)} km</p>
                        <p className="text-[10px] text-slate-500">
                          {isCompleted ? 'Completed' : isPast ? 'Past' : `${w.completed}/${w.runnable} done`}
                        </p>
                      </div>
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1">
                    {w.sessions.map((s) => {
                      const info = sessionTypeInfo(s.session_type)
                      return (
                        <span
                          key={s.id}
                          className="h-1.5 flex-1 rounded-full"
                          style={{
                            backgroundColor: s.session_type === 'rest' || isOver ? 'rgba(255,255,255,0.08)' : info.color,
                            opacity: isOver ? 1 : s.status === 'completed' ? 1 : 0.4
                          }}
                        />
                      )
                    })}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="days"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2.5 border-t border-white/5 p-4 pt-3">
                        {w.sessions.map((s) => (
                          <SessionCard
                            key={s.id}
                            session={s}
                            dateLabel={format(new Date(s.session_date + 'T00:00:00'), 'EEE, MMM d')}
                            routePolyline={polylineMap.get(s.id)}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </PageTransition>
  )
}
