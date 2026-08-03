import { motion } from 'framer-motion'

export interface LinePoint {
  /** X-axis position, typically a timestamp or index. */
  x: number
  /** Y value. For pace charts this is sec/km, so smaller is better. */
  y: number
}

/**
 * Single-series line chart with an optional shaded target band.
 *
 * Set `invertY` for pace series, where a lower value should appear higher on the
 * chart. Hand-rolled SVG, matching ProgressRing's approach.
 */
export function LineChart({
  points,
  band,
  height = 128,
  invertY = false,
  formatY
}: {
  points: LinePoint[]
  /** Highlighted target range in the same units as `y`. */
  band?: { from: number; to: number } | null
  height?: number
  invertY?: boolean
  formatY?: (v: number) => string
}) {
  if (points.length === 0) return null

  const sorted = [...points].sort((a, b) => a.x - b.x)
  const ys = sorted.map((p) => p.y)
  const candidates = band ? [...ys, band.from, band.to] : ys
  let min = Math.min(...candidates)
  let max = Math.max(...candidates)
  // Pad the range so the line never rides the edge, and guard a flat series.
  const pad = (max - min) * 0.12 || Math.max(1, max * 0.05)
  min -= pad
  max += pad

  const xs = sorted.map((p) => p.x)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const xSpan = xMax - xMin || 1

  const toX = (x: number) => ((x - xMin) / xSpan) * 100
  const toY = (y: number) => {
    const f = (y - min) / (max - min)
    return (invertY ? f : 1 - f) * height
  }

  const path = sorted
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`)
    .join(' ')

  const bandTop = band ? Math.min(toY(band.from), toY(band.to)) : 0
  const bandHeight = band ? Math.abs(toY(band.to) - toY(band.from)) : 0

  return (
    <div>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
        role="img"
        aria-label={`Trend across ${sorted.length} runs`}
      >
        {band && (
          <rect
            x={0}
            y={bandTop}
            width={100}
            height={bandHeight}
            fill="rgba(139,107,255,0.14)"
          />
        )}

        <motion.path
          d={path}
          fill="none"
          stroke="url(#line-gradient)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />

        {sorted.map((p, i) => (
          <circle
            key={`${p.x}-${i}`}
            cx={toX(p.x)}
            cy={toY(p.y)}
            r={2}
            fill="#0A0F1C"
            stroke="#2DD4BF"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <defs>
          <linearGradient id="line-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8B6BFF" />
            <stop offset="100%" stopColor="#2DD4BF" />
          </linearGradient>
        </defs>
      </svg>

      {formatY && (
        <p className="mt-1 text-center text-[10px] text-slate-500">
          {formatY(Math.min(...ys))} – {formatY(Math.max(...ys))}
        </p>
      )}
    </div>
  )
}
