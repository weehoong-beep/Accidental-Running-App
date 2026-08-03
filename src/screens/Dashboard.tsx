import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { addDays, differenceInCalendarDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import type { TrainingPlan } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useRaceEvent, useSessions } from '@/lib/queries'
import { SessionCard } from '@/components/SessionCard'
import { ProgressRing } from '@/components/ProgressRing'
import { PageTransition } from '@/components/layout/PageTransition'
import { sessionTypeInfo } from '@/lib/higdon'

export function Dashboard({ plan }: { plan: TrainingPlan }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: sessions = [] } = useSessions(plan.id)
  const { data: race } = useRaceEvent(plan.race_event_id)

  const todayStr = new Date().toISOString().slice(0, 10)
  const today = sessions.find((s) => s.session_date === todayStr)
  const yesterday = sessions.find((s) => s.session_date === format(addDays(new Date(), -1), 'yyyy-MM-dd'))
  const tomorrow = sessions.find((s) => s.session_date === format(addDays(new Date(), 1), 'yyyy-MM-dd'))

  const weekSessions = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i)
      const dateStr = format(d, 'yyyy-MM-dd')
      return { date: d, session: sessions.find((s) => s.session_date === dateStr) }
    })
  }, [sessions])

  const weekCompleted = weekSessions.filter((w) => w.session?.status === 'completed').length
  const weekTotal = weekSessions.filter((w) => w.session && w.session.session_type !== 'rest').length
  const progress = weekTotal ? weekCompleted / weekTotal : 0

  const daysToRace = race ? differenceInCalendarDays(parseISO(race.race_date), new Date()) : null

  return (
    <PageTransition>
      <div className="px-5 pt-6 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">{format(new Date(), 'EEEE, MMM d')}</p>
            <h1 className="text-xl font-extrabold tracking-tight">
              Hi {user?.user_metadata?.full_name?.split(' ')?.[0] ?? 'there'} 👋
            </h1>
          </div>
          <ProgressRing progress={progress} size={64} stroke={6} label={`${weekCompleted}/${weekTotal}`} />
        </div>

        {race && daysToRace !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-2xl bg-coral-gradient p-4 text-black shadow-glow"
          >
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{race.distance_label}</p>
            <p className="text-lg font-extrabold">{race.name}</p>
            <p className="text-sm font-medium opacity-80">
              {daysToRace > 0 ? `${daysToRace} days to go` : daysToRace === 0 ? 'Race day! 🎉' : 'Race complete'}
            </p>
          </motion.div>
        )}

        {/* week strip */}
        <div className="mt-5 grid grid-cols-7 gap-1.5">
          {weekSessions.map(({ date, session }) => {
            const isToday = isSameDay(date, new Date())
            const info = session ? sessionTypeInfo(session.session_type) : null
            return (
              <button
                key={date.toISOString()}
                onClick={() => session && navigate(`/session/${session.id}`)}
                className={`flex flex-col items-center gap-1 rounded-xl py-2 ${
                  isToday ? 'bg-white/10 ring-1 ring-white/20' : 'bg-white/[0.03]'
                }`}
              >
                <span className="text-[10px] text-slate-400">{format(date, 'EEEEE')}</span>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: info?.color ?? 'rgba(255,255,255,0.15)' }}
                />
                <span className="text-[11px] font-semibold">{format(date, 'd')}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-6 space-y-3">
          <SectionLabel text="Yesterday" />
          {yesterday ? <SessionCard session={yesterday} dateLabel="Yesterday" /> : <EmptyRow />}

          <SectionLabel text="Today" />
          {today ? <SessionCard session={today} emphasize dateLabel="Today" /> : <EmptyRow />}

          <SectionLabel text="Tomorrow" />
          {tomorrow ? <SessionCard session={tomorrow} dateLabel="Tomorrow" /> : <EmptyRow />}
        </div>
      </div>
    </PageTransition>
  )
}

function SectionLabel({ text }: { text: string }) {
  return <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{text}</p>
}

function EmptyRow() {
  return <div className="card p-4 text-center text-xs text-slate-500">No session scheduled</div>
}
