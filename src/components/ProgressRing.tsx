import { motion } from 'framer-motion'

export function ProgressRing({
  progress,
  size = 88,
  stroke = 8,
  label,
  sublabel
}: {
  progress: number // 0..1
  size?: number
  stroke?: number
  label?: string
  sublabel?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, progress))

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring-gradient)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clamped) }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8B6BFF" />
            <stop offset="55%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#FF7A59" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <span className="text-lg font-bold">{label}</span>}
        {sublabel && <span className="text-[10px] text-slate-400">{sublabel}</span>}
      </div>
    </div>
  )
}
