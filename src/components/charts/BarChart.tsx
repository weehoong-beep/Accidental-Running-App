import { motion } from 'framer-motion'

export interface BarGroup {
  label: string
  planned: number
  actual: number
}

/**
 * Grouped bars comparing a planned and an actual value per period.
 *
 * Hand-rolled SVG in the same spirit as ProgressRing — the app deliberately
 * ships without a charting library.
 */
export function BarChart({
  data,
  height = 128,
  unit = ''
}: {
  data: BarGroup[]
  height?: number
  unit?: string
}) {
  if (data.length === 0) return null

  const max = Math.max(...data.flatMap((d) => [d.planned, d.actual]), 1)
  // Leave room below the plot for the labels.
  const labelBand = 16
  const plot = height - labelBand
  const slot = 100 / data.length
  const barWidth = slot * 0.3
  const gap = slot * 0.06

  return (
    <div>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Planned versus actual by period, peak ${max.toFixed(1)}${unit}`}
      >
        {/* Gridlines at the quarter marks. */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={100}
            y1={plot - plot * f}
            y2={plot - plot * f}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {data.map((d, i) => {
          const centre = i * slot + slot / 2
          const plannedH = (d.planned / max) * plot
          const actualH = (d.actual / max) * plot
          return (
            <g key={d.label}>
              <motion.rect
                x={centre - barWidth - gap / 2}
                width={barWidth}
                rx={1}
                fill="rgba(255,255,255,0.16)"
                initial={{ y: plot, height: 0 }}
                animate={{ y: plot - plannedH, height: plannedH }}
                transition={{ duration: 0.5, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.rect
                x={centre + gap / 2}
                width={barWidth}
                rx={1}
                fill="url(#bar-gradient)"
                initial={{ y: plot, height: 0 }}
                animate={{ y: plot - actualH, height: actualH }}
                transition={{ duration: 0.5, delay: i * 0.03 + 0.05, ease: [0.16, 1, 0.3, 1] }}
              />
            </g>
          )
        })}

        <defs>
          <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B6BFF" />
            <stop offset="100%" stopColor="#2DD4BF" />
          </linearGradient>
        </defs>
      </svg>

      {/* Labels sit outside the SVG so preserveAspectRatio="none" cannot stretch the text. */}
      <div className="flex">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 text-center text-[9px] text-slate-500"
            style={{ minWidth: 0 }}
          >
            {d.label}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-white/20" /> Planned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent-purple" /> Actual
        </span>
      </div>
    </div>
  )
}
