import { describe, expect, it } from 'vitest'
import { arrangeRunsSideBySide, boundsXZ, projectRun } from './project'

describe('projectRun', () => {
  it('centers a run on its own centroid', () => {
    const points = [
      { lat: 3.14, lng: 101.7 },
      { lat: 3.15, lng: 101.71 },
      { lat: 3.13, lng: 101.69 }
    ]
    const projected = projectRun(points)
    const avgX = projected.reduce((s, p) => s + p.x, 0) / projected.length
    const avgZ = projected.reduce((s, p) => s + p.z, 0) / projected.length
    expect(avgX).toBeCloseTo(0, 0)
    expect(avgZ).toBeCloseTo(0, 0)
  })

  it('moving north increases z and moving east increases x', () => {
    const points = [
      { lat: 3.0, lng: 101.0 },
      { lat: 3.01, lng: 101.0 }, // due north
      { lat: 3.0, lng: 101.01 } // due east
    ]
    const [origin, north, east] = projectRun(points, 1)
    expect(north.z).toBeGreaterThan(origin.z)
    expect(east.x).toBeGreaterThan(origin.x)
  })

  it('offsets elevation so the lowest point sits at y=0, exaggerated', () => {
    const points = [
      { lat: 3.0, lng: 101.0, elevationM: 100 },
      { lat: 3.001, lng: 101.0, elevationM: 110 }
    ]
    const projected = projectRun(points, 2)
    expect(Math.min(...projected.map((p) => p.y))).toBe(0)
    expect(Math.max(...projected.map((p) => p.y))).toBeCloseTo(20, 5) // (110-100)*2
  })

  it('returns an empty array for no points', () => {
    expect(projectRun([])).toEqual([])
  })
})

describe('arrangeRunsSideBySide', () => {
  it('does not overlap two runs of the same width', () => {
    const runA = [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 }
    ]
    const runB = [
      { x: -1, y: 0, z: 5 },
      { x: 1, y: 0, z: 5 }
    ]
    const [arrangedA, arrangedB] = arrangeRunsSideBySide([runA, runB], 4)
    const boundsA = boundsXZ(arrangedA)
    const boundsB = boundsXZ(arrangedB)
    expect(boundsB.minX).toBeGreaterThanOrEqual(boundsA.maxX)
  })

  it('recenters the whole arrangement around the origin', () => {
    const runA = [{ x: 0, y: 0, z: 0 }]
    const runB = [{ x: 0, y: 0, z: 0 }]
    const arranged = arrangeRunsSideBySide([runA, runB], 10)
    const allX = arranged.flatMap((r) => r.map((p) => p.x))
    const center = (Math.min(...allX) + Math.max(...allX)) / 2
    expect(center).toBeCloseTo(0, 5)
  })

  it('passes through an empty run unchanged', () => {
    const result = arrangeRunsSideBySide([[], [{ x: 0, y: 0, z: 0 }]], 5)
    expect(result[0]).toEqual([])
  })
})
