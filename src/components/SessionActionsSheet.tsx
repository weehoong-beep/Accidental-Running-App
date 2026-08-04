import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TrainingSession } from '@/lib/types'
import { useMarkSessionStatus, useRescheduleSession, useSessions, useSwapSessions } from '@/lib/queries'
import { sessionTypeInfo } from '@/lib/higdon'
import { formatShortDate } from '@/lib/format'

type Tab = 'reschedule' | 'swap' | 'complete'

export function SessionActionsSheet({
  session,
  initialTab = 'reschedule',
  onClose
}: {
  session: TrainingSession
  initialTab?: Tab
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const reschedule = useRescheduleSession()
  const swap = useSwapSessions()
  const markStatus = useMarkSessionStatus()
  const { data: allSessions = [] } = useSessions(session.plan_id)

  const [newDate, setNewDate] = useState(session.session_date)
  const [swapTarget, setSwapTarget] = useState('')
  const [actualKm, setActualKm] = useState('')

  const futureSwaps = allSessions.filter(
    (s) => s.id !== session.id && s.session_date >= session.session_date && s.session_type !== 'rest'
  )

  async function handleReschedule() {
    await reschedule.mutateAsync({ id: session.id, newDate })
    onClose()
  }

  async function handleSwap() {
    if (!swapTarget) return
    await swap.mutateAsync({ aId: session.id, bId: swapTarget })
    onClose()
  }

  async function handleComplete() {
    const km = parseFloat(actualKm)
    await markStatus.mutateAsync({
      id: session.id,
      status: 'completed',
      actualDistanceM: !isNaN(km) ? km * 1000 : session.planned_distance_m,
      actualDurationSec: session.planned_duration_sec
    })
    onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-bg-900 p-5 safe-bottom"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
        <p className="text-center text-sm font-semibold">{session.title || sessionTypeInfo(session.session_type).label}</p>

        <div className="mt-4 flex gap-1 rounded-xl bg-white/5 p-1">
          {(['reschedule', 'swap', 'complete'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-colors ${
                tab === t ? 'bg-white/10 text-white' : 'text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === 'reschedule' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Move this session to a new date.</p>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-3 text-sm outline-none"
              />
              <button
                onClick={handleReschedule}
                disabled={reschedule.isPending}
                className="w-full rounded-xl bg-accent-gradient py-3 text-sm font-semibold text-black disabled:opacity-60"
              >
                {reschedule.isPending ? 'Moving…' : 'Move session'}
              </button>
            </div>
          )}

          {tab === 'swap' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Swap dates with a future session.</p>
              <select
                value={swapTarget}
                onChange={(e) => setSwapTarget(e.target.value)}
                className="w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-3 text-sm outline-none"
              >
                <option value="">Select a session…</option>
                {futureSwaps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatShortDate(s.session_date)} — {s.title || sessionTypeInfo(s.session_type).label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSwap}
                disabled={swap.isPending || !swapTarget}
                className="w-full rounded-xl bg-accent-gradient py-3 text-sm font-semibold text-black disabled:opacity-60"
              >
                {swap.isPending ? 'Swapping…' : 'Swap sessions'}
              </button>
            </div>
          )}

          {tab === 'complete' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Manually mark as completed (use this if you ran it outside Strava, or need to correct the sync).
              </p>
              <input
                type="number"
                step="0.1"
                placeholder={`Actual distance in km (planned: ${session.planned_distance_m ? session.planned_distance_m / 1000 : '—'})`}
                value={actualKm}
                onChange={(e) => setActualKm(e.target.value)}
                className="w-full rounded-xl bg-bg-800 border border-white/10 px-4 py-3 text-sm outline-none"
              />
              <button
                onClick={handleComplete}
                disabled={markStatus.isPending}
                className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black disabled:opacity-60"
              >
                {markStatus.isPending ? 'Saving…' : 'Mark completed'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
