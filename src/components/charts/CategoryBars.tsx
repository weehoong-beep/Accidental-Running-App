import { motion } from 'framer-motion'
import type { SessionType } from '@/lib/types'
import { sessionTypeInfo } from '@/lib/higdon'

export interface CategoryDatum {
  type: SessionType
  km: number
}

/** Horizontal bars, one per session type, colored to match each type's icon/pill color elsewhere in the app. */
export function CategoryBars({ data, unit = ' km' }: { data: CategoryDatum[]; unit?: string }) {
  if (data.length === 0) return null

  const max = Math.max(...data.map((d) => d.km), 1)

  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const info = sessionTypeInfo(d.type)
        const width = (d.km / max) * 100
        return (
          <div key={d.type} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] font-medium text-slate-300">{info.short}</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: info.color }}
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-[10px] text-slate-500">
              {d.km.toFixed(1)}
              {unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}
