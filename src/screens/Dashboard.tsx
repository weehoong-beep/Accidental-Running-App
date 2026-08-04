import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { TrainingPlan } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { useActivities, useProfile, useRaceEvent, useSessions } from '@/lib/queries'
import { SessionCard } from '@/components/SessionCard'
import { ProgressRing } from '@/components/ProgressRing'
import { WeekCalendarCard } from '@/components/WeekCalendarCard'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { CategoryBars } from '@/components/charts/CategoryBars'
import { PageTransition } from '@/components/layout/PageTransition'
import {
  computeCompletionRate,
  computeDistanceByType,
  computeEasyPacePoints,
  computeWeeklyVolume,
  findCurrentWeek,
  groupSessionsByWeek
} from '@/lib/stats'
import { buildPolylineMap } from '@/lib/polyline'
import { formatInMY, shiftDateString, todayMY } from '@/lib/timezone'
import { paceToString } from '@/lib/format'

export function Dashboard({ plan }: { plan: TrainingPlan }) {
  const { user } = useAuth()
  const { data: sessions = [] } = useSessions(plan.id)
  const { data: race } = useRaceEvent(plan.race_event_id)
  const { data: activities = [] } = useActivities(user?.id)
  const { data: profile } = useProfile(user?.id)

  const todayStr = todayMY()
  const yesterdayStr = shiftDateString(todayStr, -1)
  const tomorrowStr = shiftDateString(todayStr, 1)

  const today = sessions.find((s) => s.session_date === todayStr)
  const yesterday = sessions.find((s) => s.session_date === yesterdayStr)
  const tomorrow = sessions.find((s) => s.session_date === tomorrowStr)

  const weeks = useMemo(() => groupSessionsByWeek(sessions), [sessions])
  const currentWeek = useMemo(() => findCurrentWeek(weeks, todayStr), [weeks, todayStr])
  const weekCompleted = currentWeek?.completed ?? 0
  const weekTotal = currentWeek?.runnable ?? 0
  const weekProgress = weekTotal ? weekCompleted / weekTotal : 0

  const daysToRace = race ? differenceInCalendarDays(parseISO(race.race_date), new Date()) : null

  const polylineMap = useMemo(() => buildPolylineMap(activities), [activities])

  const completion = useMemo(() => computeCompletionRate(sessions), [sessions])
  const totalKmLogged = useMemo(
    () => sessions.reduce((sum, s) => sum + (s.status === 'completed' ? (s.actual_distance_m ?? s.planned_distance_m ?? 0) : 0), 0) / 1000,
    [sessions]
  )
  const weeklyVolume = useMemo(() => computeWeeklyVolume(sessions), [sessions])
  const distanceByType = useMemo(() => computeDistanceByType(sessions), [sessions])
  const easyPacePoints = useMemo(() => computeEasyPacePoints(activities, sessions), [activities, sessions])
  const easyBand =
    profile?.easy_pace_min_sec && profile?.easy_pace_max_sec
      ? { from: profile.easy_pace_min_sec, to: profile.easy_pace_max_sec }
      : null

  return (
    <PageTransition>
      <div className="px-5 pt-6 safe-top">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">{formatInMY(new Date(), { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            <h1 className="text-xl font-extrabold tracking-tight">
              Hi {user?.user_metadata?.full_name?.split(' ')?.[0] ?? 'there'} 👋
            </h1>
          </div>
          <ProgressRing progress={weekProgress} size={64} stroke={6} label={`${weekCompleted}/${weekTotal}`} />
        </div>

        {race && daysToRace !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-center gap-3 rounded-2xl bg-coral-gradient p-4 text-black shadow-glow"
          >
            <img src="/images/klscm-logo.svg" alt="" className="h-10 w-10 shrink-0 rounded-full" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{race.distance_label}</p>
              <p className="text-lg font-extrabold">{race.name}</p>
              <p className="text-sm font-medium opacity-80">
                {daysToRace > 0 ? `${daysToRace} days to go` : daysToRace === 0 ? 'Race day! 🎉' : 'Race complete'}
              </p>
            </div>
          </motion.div>
        )}

        <div className="mt-5">
          <WeekCalendarCard sessions={sessions} />
        </div>

        <div className="mt-6 space-y-3">
          <SectionLabel text="Yesterday" />
          {yesterday ? (
            <SessionCard session={yesterday} dateLabel="Yesterday" routePolyline={polylineMap.get(yesterday.id)} />
          ) : (
            <EmptyRow />
          )}

          <SectionLabel text="Today" />
          {today ? (
            <SessionCard session={today} emphasize dateLabel="Today" routePolyline={polylineMap.get(today.id)} />
          ) : (
            <EmptyRow />
          )}

          <SectionLabel text="Tomorrow" />
          {tomorrow ? (
            <SessionCard session={tomorrow} dateLabel="Tomorrow" routePolyline={polylineMap.get(tomorrow.id)} />
          ) : (
            <EmptyRow />
          )}
        </div>

        <div className="mt-6">
          <SectionLabel text="Training Stats" />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Block progress</p>
              <p className="mt-1 text-lg font-bold">
                {completion.completed}/{completion.runnable}
              </p>
              <p className="text-[10px] text-slate-500">sessions completed</p>
            </div>
            <div className="card p-4">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Distance logged</p>
              <p className="mt-1 text-lg font-bold">{totalKmLogged.toFixed(1)} km</p>
              <p className="text-[10px] text-slate-500">this training block</p>
            </div>
          </div>

          {weeklyVolume.length > 0 && (
            <div className="card mt-3 p-4">
              <p className="mb-2 text-xs text-slate-400">Weekly volume — planned vs actual</p>
              <BarChart data={weeklyVolume} unit=" km" />
            </div>
          )}

          {distanceByType.length > 0 && (
            <div className="card mt-3 p-4">
              <p className="mb-2 text-xs text-slate-400">Distance by run type</p>
              <CategoryBars data={distanceByType} />
            </div>
          )}

          <div className="card mt-3 p-4">
            <p className="mb-2 text-xs text-slate-400">
              Easy-run pace
              {easyBand ? ' — shaded band is your easy range' : ''}
            </p>
            {easyPacePoints.length < 2 ? (
              <p className="text-sm text-slate-500">Needs at least two easy or long runs matched to your plan.</p>
            ) : (
              <LineChart points={easyPacePoints} band={easyBand} invertY formatY={(v) => paceToString(Math.round(v))} />
            )}
          </div>
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
