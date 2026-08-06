import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TrainingSession } from '@/lib/types'
import { useMarkSessionStatus } from '@/lib/queries'
import { sessionTypeInfo } from '@/lib/higdon'

export function MarkCompleteSheet({ session, onClose }: { session: TrainingSession; onClose: () => void }) {
  const markStatus = useMarkSessionStatus()
  const [actualKm, setActualKm] = useState('')

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
        key="backdrop"
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        key="sheet"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-bg-900 p-5 safe-bottom"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
        <p className="text-center text-sm font-semibold">{session.title || sessionTypeInfo(session.session_type).label}</p>

        <div className="mt-4 space-y-3">
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
      </motion.div>
    </AnimatePresence>
  )
}
