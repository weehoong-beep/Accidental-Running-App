import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Bounds, OrbitControls } from '@react-three/drei'

/** How long to wait after the user lets go before auto-orbit resumes. */
const RESUME_IDLE_MS = 5000

/**
 * Auto-frames whatever geometry it wraps (`Bounds`), auto-orbits by default,
 * and hands off to user drag/pinch via `OrbitControls` — resuming auto-orbit
 * after a few seconds of no interaction.
 */
export function CameraRig({ children, autoRotate: autoRotateEnabled = true }: { children: ReactNode; autoRotate?: boolean }) {
  const [autoRotate, setAutoRotate] = useState(autoRotateEnabled)
  const resumeTimer = useRef<number>()

  const handleStart = useCallback(() => {
    setAutoRotate(false)
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current)
  }, [])

  const handleEnd = useCallback(() => {
    if (!autoRotateEnabled) return
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current)
    resumeTimer.current = window.setTimeout(() => setAutoRotate(true), RESUME_IDLE_MS)
  }, [autoRotateEnabled])

  return (
    <>
      <Bounds fit clip observe margin={1.3}>
        {children}
      </Bounds>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        onStart={handleStart}
        onEnd={handleEnd}
      />
    </>
  )
}
