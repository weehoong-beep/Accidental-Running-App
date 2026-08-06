import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { format } from 'date-fns'
import type { TrainingPlan, TrainingSession } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useActivities, useSessions, useSwapSessions } from '@/lib/queries'
import { sessionTypeInfo } from '@/lib/higdon'
import { SessionCard } from '@/components/SessionCard'
import { SwapConfirmDialog } from '@/components/SwapConfirmDialog'
import { PageTransition } from '@/components/layout/PageTransition'
import { groupSessionsByWeek } from '@/lib/stats'
import { buildPolylineMap } from '@/lib/polyline'
import { todayMY } from '@/lib/timezone'

interface DragState {
  session: TrainingSession
  dateLabel: string
  routePolyline: string | null | undefined
  /** Other sessions in the same week that this one can be dropped onto. */
  candidates: TrainingSession[]
  originRect: DOMRect
  startX: number
  startY: number
  hoverId: string | null
}

export function Weekly({ plan }: { plan: TrainingPlan }) {
  const { user } = useAuth()
  const { data: sessions = [] } = useSessions(plan.id)
  const { data: activities = [] } = useActivities(user?.id)
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(new Set())
  const todayStr = todayMY()
  const swap = useSwapSessions()

  const weeks = useMemo(() => groupSessionsByWeek(sessions), [sessions])
  const polylineMap = useMemo(() => buildPolylineMap(activities), [activities])

  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const registerCardRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }, [])

  const [drag, setDrag] = useState<DragState | null>(null)
  const [pendingSwap, setPendingSwap] = useState<{ a: TrainingSession; b: TrainingSession } | null>(null)

  const dx = useMotionValue(0)
  const dy = useMotionValue(0)
  const springX = useSpring(dx, { stiffness: 500, damping: 38, mass: 0.5 })
  const springY = useSpring(dy, { stiffness: 500, damping: 38, mass: 0.5 })

  const toggleWeek = (week: number) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(week)) next.delete(week)
      else next.add(week)
      return next
    })
  }

  const startDrag = (
    session: TrainingSession,
    dateLabel: string,
    routePolyline: string | null | undefined,
    candidates: TrainingSession[],
    info: { rect: DOMRect; pointer: { x: number; y: number } }
  ) => {
    dx.set(0)
    dy.set(0)
    setDrag({
      session,
      dateLabel,
      routePolyline,
      candidates,
      originRect: info.rect,
      startX: info.pointer.x,
      startY: info.pointer.y,
      hoverId: null
    })
  }

  useEffect(() => {
    if (!drag) return
    const active = drag

    function onMove(e: PointerEvent) {
      e.preventDefault()
      dx.set(e.clientX - active.startX)
      dy.set(e.clientY - active.startY)

      let hoverId: string | null = null
      for (const s of active.candidates) {
        if (s.id === active.session.id || s.status === 'completed') continue
        const el = cardRefs.current.get(s.id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          hoverId = s.id
          break
        }
      }
      setDrag((d) => (d && d.hoverId !== hoverId ? { ...d, hoverId } : d))
    }

    function onUp() {
      setDrag((d) => {
        if (d?.hoverId) {
          const target = d.candidates.find((s) => s.id === d.hoverId)
          if (target) setPendingSwap({ a: d.session, b: target })
        }
        return null
      })
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag?.session.id, dx, dy])

  async function confirmSwap() {
    if (!pendingSwap) return
    await swap.mutateAsync({ aId: pendingSwap.a.id, bId: pendingSwap.b.id })
    setPendingSwap(null)
  }

  return (
    <PageTransition>
      <div className="px-5 pt-6 safe-top">
        <h1 className="text-xl font-extrabold">Weekly Plan</h1>
        <p className="mt-1 text-xs text-slate-400">
          {plan.weeks}-week block · {plan.methodology === 'higdon' ? 'Hal Higdon Intermediate 2' : plan.methodology}
        </p>
        <p className="mt-2 text-[11px] text-slate-500">Press and hold a session, then drag it onto another day to swap.</p>

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
                        {w.sessions.map((s) => {
                          const dateLabel = format(new Date(s.session_date + 'T00:00:00'), 'EEE, MMM d')
                          const routePolyline = polylineMap.get(s.id)
                          return (
                            <SessionCard
                              key={s.id}
                              session={s}
                              dateLabel={dateLabel}
                              routePolyline={routePolyline}
                              draggable={!isOver && s.status !== 'completed'}
                              isGhost={drag?.session.id === s.id}
                              isDropTarget={drag?.hoverId === s.id}
                              registerRef={(el) => registerCardRef(s.id, el)}
                              onLongPress={(info) => startDrag(s, dateLabel, routePolyline, w.sessions, info)}
                            />
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>

      {drag && (
        <motion.div
          className="pointer-events-none fixed z-50"
          style={{ left: drag.originRect.left, top: drag.originRect.top, width: drag.originRect.width, x: springX, y: springY }}
        >
          <SessionCard session={drag.session} dateLabel={drag.dateLabel} routePolyline={drag.routePolyline} overlay />
        </motion.div>
      )}

      {pendingSwap && (
        <SwapConfirmDialog
          a={pendingSwap.a}
          b={pendingSwap.b}
          pending={swap.isPending}
          onConfirm={confirmSwap}
          onCancel={() => setPendingSwap(null)}
        />
      )}
    </PageTransition>
  )
}
