import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import type { WeeklyRouteRibbon } from '@/lib/weeklyReport'
import { buildWeekRibbons, type ColorMode, type RibbonMesh } from './buildRibbonGeometry'
import { CameraRig } from './CameraRig'

const DRAW_DURATION_SEC = 1.4

/** Animates a tube's `drawRange` from 0 to full so the ribbon looks like it draws itself in. */
function DrawOnRibbon({ mesh, delay = 0, skipAnimation = false }: { mesh: RibbonMesh; delay?: number; skipAnimation?: boolean }) {
  const startRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const total = mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count

  useEffect(() => {
    if (skipAnimation) {
      mesh.geometry.setDrawRange(0, total)
      doneRef.current = true
    } else {
      mesh.geometry.setDrawRange(0, 0)
      doneRef.current = false
      startRef.current = null
    }
  }, [mesh, skipAnimation, total])

  useFrame((state) => {
    if (doneRef.current) return
    if (startRef.current === null) startRef.current = state.clock.elapsedTime + delay
    const elapsed = state.clock.elapsedTime - startRef.current
    const progress = Math.max(0, Math.min(1, elapsed / DRAW_DURATION_SEC))
    mesh.geometry.setDrawRange(0, Math.floor(total * progress))
    if (progress >= 1) doneRef.current = true
  })

  return (
    <mesh geometry={mesh.geometry}>
      <meshStandardMaterial vertexColors roughness={0.35} metalness={0.05} />
    </mesh>
  )
}

export function RouteRibbon3D({
  ribbons,
  colorMode = 'pace',
  animate = true
}: {
  ribbons: WeeklyRouteRibbon[]
  colorMode?: ColorMode
  animate?: boolean
}) {
  const [dpr, setDpr] = useState<[number, number]>([1, 2])
  const meshes = useMemo(() => buildWeekRibbons(ribbons, colorMode), [ribbons, colorMode])

  useEffect(() => {
    return () => {
      meshes.forEach((m) => m.geometry.dispose())
    }
  }, [meshes])

  if (meshes.length === 0) return null

  return (
    <div className="h-72 w-full overflow-hidden rounded-2xl bg-bg-900" style={{ touchAction: 'none' }}>
      <Canvas dpr={dpr} camera={{ fov: 50, position: [0, 12, 22] }} shadows={false}>
        <PerformanceMonitor onDecline={() => setDpr([1, 1])} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[10, 16, 10]} intensity={1.1} />
        <directionalLight position={[-8, 6, -6]} intensity={0.3} color="#8B6BFF" />
        <CameraRig autoRotate={animate}>
          <group>
            {meshes.map((m, i) => (
              <DrawOnRibbon key={m.activityId} mesh={m} delay={i * 0.15} skipAnimation={!animate} />
            ))}
          </group>
        </CameraRig>
      </Canvas>
    </div>
  )
}

export default RouteRibbon3D
