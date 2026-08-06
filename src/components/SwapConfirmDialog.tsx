import { AnimatePresence, motion } from 'framer-motion'
import type { TrainingSession } from '@/lib/types'
import { sessionTypeInfo } from '@/lib/higdon'
import { formatShortDate } from '@/lib/format'
import { SessionTypeIcon } from './SessionTypeIcon'

/** Confirmation shown after a session is dragged onto another day's card. */
export function SwapConfirmDialog({
  a,
  b,
  pending,
  onConfirm,
  onCancel
}: {
  a: TrainingSession
  b: TrainingSession
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      />
      <motion.div
        key="dialog"
        className="fixed inset-x-5 top-1/2 z-[60] -translate-y-1/2 rounded-3xl bg-bg-900 border border-white/10 p-5"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
      >
        <p className="text-center text-sm font-semibold">Swap these sessions?</p>
        <div className="mt-4 space-y-2">
          <SwapRow session={a} />
          <div className="flex justify-center text-slate-500">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M7 10l5 5 5-5M7 4v11m10 5V9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <SwapRow session={b} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-xl bg-white/8 py-3 text-sm font-semibold">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="rounded-xl bg-accent-gradient py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {pending ? 'Swapping…' : 'Swap'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function SwapRow({ session }: { session: TrainingSession }) {
  const info = sessionTypeInfo(session.session_type)
  return (
    <div className={`flex items-center gap-3 rounded-xl bg-gradient-to-br p-3 ${info.gradient}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/20">
        <SessionTypeIcon type={session.session_type} className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{session.title || info.label}</p>
        <p className="text-xs text-slate-400">{formatShortDate(session.session_date)}</p>
      </div>
    </div>
  )
}
