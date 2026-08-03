import { describe, expect, it } from 'vitest'
import {
  ageFromDob,
  bmi,
  equivalentTimes,
  estimatedMaxHr,
  hrZones,
  pacesFromVdot,
  predictTime,
  timeForDistanceAtVdot,
  vdotFromRace,
  zoneForHr
} from './physiology'

/**
 * These tests are the correctness gate for the whole feature: every training
 * target the app shows, and every judgement the AI coach makes, is downstream of
 * this math. Reference values come from Daniels' Running Formula pace tables.
 */

describe('vdotFromRace', () => {
  it('matches published VDOT for a 20:00 5K', () => {
    // Daniels' table puts a 19:57 5K at VDOT 50.
    expect(vdotFromRace(5000, 20 * 60)).toBeCloseTo(49.8, 1)
  })

  it('matches published VDOT for a 40:00 10K', () => {
    // Daniels' table puts a 40:03 10K at VDOT 52.
    expect(vdotFromRace(10000, 40 * 60)).toBeCloseTo(51.9, 1)
  })

  it('rates the same velocity higher over a longer distance', () => {
    // 250 m/min held for 10K is a fitter performance than for 5K.
    const fiveK = vdotFromRace(5000, 20 * 60)!
    const tenK = vdotFromRace(10000, 40 * 60)!
    expect(tenK).toBeGreaterThan(fiveK)
  })

  it('increases as the same distance is run faster', () => {
    expect(vdotFromRace(10000, 38 * 60)!).toBeGreaterThan(vdotFromRace(10000, 42 * 60)!)
  })

  it('rejects non-positive inputs', () => {
    expect(vdotFromRace(0, 1200)).toBeNull()
    expect(vdotFromRace(5000, 0)).toBeNull()
    expect(vdotFromRace(-5000, 1200)).toBeNull()
  })
})

describe('pacesFromVdot', () => {
  // Daniels' table for VDOT 50: E 5:38–5:07, M 4:29, T 4:15, I 3:50, R 3:30 per km.
  const paces = pacesFromVdot(50)!

  it('reproduces the published VDOT 50 pace set within a second', () => {
    expect(paces.easyMax).toBeCloseTo(338, 0) // 5:38
    expect(paces.easyMin).toBeCloseTo(307, 0) // 5:07
    expect(paces.marathon).toBeCloseTo(269, 0) // 4:29
    expect(paces.threshold).toBeCloseTo(255, 0) // 4:15
    expect(paces.interval).toBeCloseTo(230, 0) // 3:50
    expect(paces.repetition).toBeCloseTo(210, 0) // 3:30
  })

  it('orders paces from slowest easy to fastest repetition', () => {
    // Lower sec/km means faster, so this sequence must strictly decrease.
    const ordered = [
      paces.easyMax,
      paces.easyMin,
      paces.marathon,
      paces.threshold,
      paces.interval,
      paces.repetition
    ]
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]).toBeLessThan(ordered[i - 1])
    }
  })

  it('gets faster at every intensity as VDOT rises', () => {
    const fitter = pacesFromVdot(60)!
    expect(fitter.easyMin).toBeLessThan(paces.easyMin)
    expect(fitter.threshold).toBeLessThan(paces.threshold)
    expect(fitter.repetition).toBeLessThan(paces.repetition)
  })

  it('rejects non-positive VDOT', () => {
    expect(pacesFromVdot(0)).toBeNull()
    expect(pacesFromVdot(-10)).toBeNull()
  })
})

describe('predictTime', () => {
  it('applies the Riegel exponent', () => {
    // 2400 * (21097/10000)^1.06 ≈ 5295 s ≈ 1:28:15
    expect(predictTime(10000, 2400, 21097)).toBe(5295)
  })

  it('returns the same time for the same distance', () => {
    expect(predictTime(10000, 2400, 10000)).toBe(2400)
  })

  it('predicts a slower pace over a longer distance', () => {
    const tenKPace = 2400 / 10
    const halfPace = predictTime(10000, 2400, 21097)! / 21.097
    expect(halfPace).toBeGreaterThan(tenKPace)
  })

  it('rejects non-positive inputs', () => {
    expect(predictTime(0, 2400, 10000)).toBeNull()
    expect(predictTime(10000, 0, 10000)).toBeNull()
    expect(predictTime(10000, 2400, 0)).toBeNull()
  })
})

describe('timeForDistanceAtVdot', () => {
  it('inverts vdotFromRace', () => {
    const time = timeForDistanceAtVdot(52, 10000)!
    expect(vdotFromRace(10000, time)).toBeCloseTo(52, 1)
  })

  it('round-trips a known performance', () => {
    const vdot = vdotFromRace(5000, 20 * 60)!
    expect(timeForDistanceAtVdot(vdot, 5000)).toBeCloseTo(1200, -1)
  })

  it('returns a longer time for a longer distance', () => {
    expect(timeForDistanceAtVdot(50, 21097)!).toBeGreaterThan(
      timeForDistanceAtVdot(50, 10000)!
    )
  })
})

describe('equivalentTimes', () => {
  const equivalents = equivalentTimes(52)

  it('covers 5K through marathon', () => {
    expect(equivalents.map((e) => e.label)).toEqual([
      '5K',
      '10K',
      '15K',
      'Half Marathon',
      'Marathon'
    ])
  })

  it('puts the 10K equivalent near the performance that produced the VDOT', () => {
    const tenK = equivalents.find((e) => e.label === '10K')!
    expect(tenK.timeSec).toBeCloseTo(2400, -2)
  })

  it('increases monotonically with distance', () => {
    for (let i = 1; i < equivalents.length; i++) {
      expect(equivalents[i].timeSec).toBeGreaterThan(equivalents[i - 1].timeSec)
    }
  })

  it('returns nothing for an invalid VDOT', () => {
    expect(equivalentTimes(0)).toEqual([])
  })
})

describe('hrZones', () => {
  it('computes Karvonen zones from heart-rate reserve', () => {
    const zones = hrZones({ maxHr: 190, restingHr: 50, model: 'karvonen' })
    expect(zones).toHaveLength(5)
    // Reserve is 140 bpm, so Z1 starts at 50 + 0.5*140 = 120.
    expect(zones[0].min).toBe(120)
    expect(zones[1].min).toBe(134)
    expect(zones[4].min).toBe(176)
    expect(zones[4].max).toBeNull()
  })

  it('computes percentage-of-max zones', () => {
    const zones = hrZones({ maxHr: 190, model: 'max_hr' })
    expect(zones[0].min).toBe(95)
    expect(zones[4].min).toBe(171)
  })

  it('computes LTHR zones', () => {
    const zones = hrZones({ lthr: 170, model: 'lthr' })
    expect(zones[3].min).toBe(160)
    expect(zones[4].min).toBe(170)
  })

  it('leaves no gaps or overlaps between adjacent zones', () => {
    const zones = hrZones({ maxHr: 190, restingHr: 50, model: 'karvonen' })
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].min).toBe(zones[i - 1].max! + 1)
    }
  })

  it('returns nothing when the model is missing its inputs', () => {
    expect(hrZones({ maxHr: 190, model: 'karvonen' })).toEqual([])
    expect(hrZones({ maxHr: 190, restingHr: 200, model: 'karvonen' })).toEqual([])
    expect(hrZones({ model: 'max_hr' })).toEqual([])
    expect(hrZones({ maxHr: 190, model: 'lthr' })).toEqual([])
  })

  it('defaults to Karvonen', () => {
    expect(hrZones({ maxHr: 190, restingHr: 50 })).toEqual(
      hrZones({ maxHr: 190, restingHr: 50, model: 'karvonen' })
    )
  })
})

describe('zoneForHr', () => {
  const zones = hrZones({ maxHr: 190, restingHr: 50, model: 'karvonen' })

  it('places a heart rate in the right zone', () => {
    expect(zoneForHr(140, zones)!.short).toBe('Z2')
    expect(zoneForHr(180, zones)!.short).toBe('Z5')
    expect(zoneForHr(120, zones)!.short).toBe('Z1')
  })

  it('returns null below the first zone or with no zones', () => {
    expect(zoneForHr(90, zones)).toBeNull()
    expect(zoneForHr(140, [])).toBeNull()
  })
})

describe('estimatedMaxHr', () => {
  it('applies the Tanaka formula', () => {
    expect(estimatedMaxHr(40)).toBe(180) // 208 - 0.7*40
    expect(estimatedMaxHr(30)).toBe(187)
  })

  it('rejects implausible ages', () => {
    expect(estimatedMaxHr(0)).toBeNull()
    expect(estimatedMaxHr(130)).toBeNull()
  })
})

describe('bmi', () => {
  it('computes body mass index to one decimal', () => {
    expect(bmi(70, 175)).toBe(22.9)
  })

  it('returns null when either input is missing', () => {
    expect(bmi(null, 175)).toBeNull()
    expect(bmi(70, null)).toBeNull()
    expect(bmi(0, 175)).toBeNull()
  })
})

describe('ageFromDob', () => {
  it('counts whole years elapsed', () => {
    expect(ageFromDob('1990-01-01', new Date('2026-06-15T00:00:00'))).toBe(36)
  })

  it('does not count a birthday that has not happened yet', () => {
    expect(ageFromDob('1990-12-31', new Date('2026-06-15T00:00:00'))).toBe(35)
  })

  it('counts the birthday itself', () => {
    expect(ageFromDob('1990-06-15', new Date('2026-06-15T00:00:00'))).toBe(36)
  })

  it('returns null for missing or unparseable input', () => {
    expect(ageFromDob(null)).toBeNull()
    expect(ageFromDob('not-a-date')).toBeNull()
  })
})
