import { sessionTypeInfo } from '@/lib/higdon'
import type { SessionType } from '@/lib/types'

const PATHS: Record<SessionType, string> = {
  cross_train: 'M8 12a4 4 0 108 0 4 4 0 00-8 0zM2 12h2m16 0h2M12 2v2m0 16v2',
  easy: 'M4 16l4-6 4 3 6-9',
  tempo: 'M4 17l4-4 3 2 5-7 4 3',
  interval: 'M3 12h3l2-5 2 10 2-8 2 4h4',
  race_pace: 'M4 12h4l2-4 2 8 2-6 2 2h4',
  long: 'M3 18c4-10 8-10 9-2 1-8 5-8 9 2',
  race: 'M5 3v18M5 4h9l-2 3 2 3H5',
  rest: 'M8 10a4 4 0 108 0M4 20h16'
}

export function SessionTypeIcon({ type, className = 'w-5 h-5' }: { type: SessionType; className?: string }) {
  const info = sessionTypeInfo(type)
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke={info.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[type] ?? PATHS.easy} />
    </svg>
  )
}
