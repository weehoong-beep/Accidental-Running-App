import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import type { TrainingPlan, TrainingSession } from '@/lib/types'
import { useSessions } from '@/lib/queries'
import { sessionTypeInfo } from '@/lib/higdon'
import { SessionCard } from '@/components/SessionCard'
import { PageTransition } from '@/components/layout/PageTransition'
import { metersToKm } from '@/lib/format'

export function Weekly({ plan }: { plan: TrainingPlan }) {
  const { data: sessions = [] } = useSessions(plan.id)
  const [activeWeek, setActiveWeek] = useState<number | null>(null)

  const weeks = useMemo(() => {
    const map = new Map<number, TrainingSession[]>()
    sessions.forEach((s) => {
      if (!map.has(s.week_index)) map.set(s.week_index, [])
      map.get(s.week_index)!.push(s)
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([week, list]) => ({
        week,
        sessions: list.sort((a, b) => a.session_date.localeCompare(b.session_date)),
        km: list.reduce((sum, s) => sum + (s.planned_distance_m ?? 0), 0) / 1000,
        completed: list.filter((s) => s.status === 'completed').length,
        runnable: list.filter((s) => s.session_type !== 'rest').length
      }))
  }, [sessions])

  const active = weeks.find((w) => w.week === activeWeek)

  return (
    <PageTransition>
      <div className="px-5 pt-6 safe-top">
        <AnimatePresence mode="wait">
          {!active ? (
            <motion.div key="list" exit={{ opacity: 0 }}>
              <h1 className="text-xl font-extrabold">Weekly Plan</h1>
              <p className="mt-1 text-xs text-slate-400">{plan.weeks}-week block · {plan.methodology === 'higdon' ? 'Hal Higdon Intermediate 2' : plan.methodology}</p>

              <div className="mt-5 space-y-3">
                {weeks.map((w) => {
                  const startDate = w.sessions[0]?.session_date
                  const endDate = w.sessions[w.sessions.length - 1]?.session_date
                  return (
                    <motion.button
                      key={w.week}
                      layoutId={`week-${w.week}`}
                      onClick={() => setActiveWeek(w.week)}
                      whileTap={{ scale: 0.98 }}
                      className="card w-full p-4 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-400">
                            {startDate && format(new Date(startDate + 'T00:00:00'), 'MMM d')} –{' '}
                            {endDate && format(new Date(endDate + 'T00:00:00'), 'MMM d')}
                          </p>
                          <p className="font-bold">Week {w.week}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{w.km.toFixed(1)} km</p>
                          <p className="text-[10px] text-slate-500">
                            {w.completed}/{w.runnable} done
                          </p>
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
                                backgroundColor: s.session_type === 'rest' ? 'rgba(255,255,255,0.08)' : info.color,
                                opacity: s.status === 'completed' ? 1 : 0.4
                              }}
                            />
                          )
                        })}
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button onClick={() => setActiveWeek(null)} className="mb-3 flex items-center gap-1 text-sm text-slate-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                All weeks
              </button>
              <motion.div layoutId={`week-${active.week}`} className="card p-4">
                <p className="text-xs text-slate-400">Week {active.week}</p>
                <p className="text-lg font-extrabold">{active.km.toFixed(1)} km planned</p>
                <p className="text-xs text-slate-500">
                  {active.completed}/{active.runnable} sessions completed
                </p>
              </motion.div>

              <div className="mt-4 space-y-2.5">
                {active.sessions.map((s) => (
                  <SessionCard key={s.id} session={s} dateLabel={format(new Date(s.session_date + 'T00:00:00'), 'EEE, MMM d')} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}
