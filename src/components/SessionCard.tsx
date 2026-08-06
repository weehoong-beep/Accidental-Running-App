import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { TrainingSession } from '@/lib/types'
import { sessionTypeInfo } from '@/lib/higdon'
import { SessionTypeIcon } from './SessionTypeIcon'
import { RouteIcon } from './RouteIcon'
import { formatWeekday, metersToKm, paceRangeToString } from '@/lib/format'
import { STATUS_STYLE } from '@/lib/sessionStatus'

/** How long a press must hold before it arms drag mode, in ms. */
const LONG_PRESS_MS = 420
/** Pointer movement before that timer fires cancels it — treat it as a scroll, not a hold. */
const MOVE_CANCEL_PX = 10

export function SessionCard({
  session,
  emphasize = false,
  dateLabel,
  routePolyline,
  draggable = false,
  isGhost = false,
  isDropTarget = false,
  overlay = false,
  onLongPress,
  registerRef
}: {
  session: TrainingSession
  emphasize?: boolean
  dateLabel?: string
  /** Decoded from the matched Strava activity's summary polyline, if any. */
  routePolyline?: string | null
  /** Enables press-and-hold-to-drag, used on the weekly view. */
  draggable?: boolean
  /** True while this card's real content is floating in the drag overlay. */
  isGhost?: boolean
  /** True while a dragged card is hovering over this one, as a swap target. */
  isDropTarget?: boolean
  /** True for the floating clone rendered inside the drag overlay itself. */
  overlay?: boolean
  onLongPress?: (info: { rect: DOMRect; pointer: { x: number; y: number } }) => void
  registerRef?: (el: HTMLButtonElement | null) => void
}) {
  const navigate = useNavigate()
  const info = sessionTypeInfo(session.session_type)
  const timerRef = useRef<number>()
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const armedRef = useRef(false)

  function clearPressTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggable || overlay || isGhost) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startRef.current = { x: e.clientX, y: e.clientY }
    armedRef.current = false
    clearPressTimer()
    const target = e.currentTarget
    timerRef.current = window.setTimeout(() => {
      armedRef.current = true
      if (navigator.vibrate) navigator.vibrate(12)
      onLongPress?.({ rect: target.getBoundingClientRect(), pointer: startRef.current! })
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!startRef.current || armedRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearPressTimer()
  }

  function handleClick() {
    if (armedRef.current) {
      armedRef.current = false
      return
    }
    navigate(`/session/${session.id}`)
  }

  return (
    <motion.button
      ref={registerRef}
      layoutId={overlay ? undefined : `session-${session.id}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearPressTimer}
      onPointerCancel={clearPressTimer}
      onPointerLeave={clearPressTimer}
      onClick={handleClick}
      whileTap={!isGhost && !overlay ? { scale: 0.97 } : undefined}
      style={{ touchAction: draggable ? 'none' : undefined }}
      className={`relative w-full text-left card p-4 flex items-center gap-3 bg-gradient-to-br ${info.gradient} transition-shadow ${
        emphasize ? 'ring-1 ring-white/10 shadow-glow' : ''
      } ${isGhost ? 'opacity-25 pointer-events-none' : ''} ${
        isDropTarget ? 'ring-2 ring-accent-teal shadow-glow scale-[1.02]' : ''
      } ${overlay ? 'shadow-2xl ring-2 ring-white/25 scale-[1.05] rotate-1 pointer-events-none' : ''}`}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/20">
        {routePolyline ? <RouteIcon polyline={routePolyline} className="h-8 w-8" /> : <SessionTypeIcon type={session.session_type} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-sm">{session.title || info.label}</p>
          <span className={`pill border ${STATUS_STYLE[session.status] ?? STATUS_STYLE.planned}`}>
            {session.status}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          {dateLabel ?? formatWeekday(session.session_date)}
          {session.planned_distance_m ? ` · ${metersToKm(session.planned_distance_m)} km` : ''}
          {session.target_pace_min_sec ? ` · ${paceRangeToString(session.target_pace_min_sec, session.target_pace_max_sec)}` : ''}
        </p>
      </div>
      {isDropTarget ? (
        <span className="pill absolute -top-2 right-3 border border-accent-teal/40 bg-accent-teal/20 text-[10px] text-accent-teal">
          Swap here
        </span>
      ) : (
        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </motion.button>
  )
}
