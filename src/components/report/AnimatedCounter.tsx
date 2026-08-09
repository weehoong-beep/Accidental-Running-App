import { useEffect } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'

/** Counts up from 0 to `value` on mount; renders the final value immediately under reduced motion. */
export function AnimatedCounter({
  value,
  format,
  duration = 1,
  delay = 0
}: {
  value: number
  format?: (v: number) => string
  duration?: number
  delay?: number
}) {
  const reduceMotion = useReducedMotion()
  const motionValue = useMotionValue(reduceMotion ? value : 0)
  const display = useTransform(motionValue, (v) => (format ? format(v) : Math.round(v).toLocaleString()))

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value)
      return
    }
    const controls = animate(motionValue, value, { duration, delay, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [value, duration, delay, reduceMotion, motionValue])

  return <motion.span>{display}</motion.span>
}
