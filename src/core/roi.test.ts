import { describe, expect, it } from 'vitest'
import { generateHoleRing, type RingSpec } from './geometry.ts'
import {
  createRoi,
  nudgeHole,
  regenerateRing,
  roiCompleteness,
  roiPixelsPerCm,
  setPlatformDiameterCm,
  setTargetHole,
} from './roi.ts'

const CENTER = { x: 320, y: 240 }
const RING: RingSpec = { center: CENTER, ringRadius: 180, rotation: 0, holeCount: 20 }

function newRoi() {
  return createRoi(CENTER, 220, RING)
}

describe('createRoi', () => {
  it('materializes the ring into twenty holes with nothing nudged yet', () => {
    const roi = newRoi()
    expect(roi.holes).toHaveLength(20)
    expect(roi.nudgedHoles).toEqual([])
    expect(roi.targetHole).toBeNull()
  })
})

describe('nudgeHole', () => {
  it('moves one hole and records it as human-placed', () => {
    const roi = nudgeHole(newRoi(), 4, { x: 111, y: 222 })
    expect(roi.holes[4]).toEqual({ x: 111, y: 222 })
    expect(roi.nudgedHoles).toEqual([4])
    // Its neighbours are untouched.
    expect(roi.holes[3]).toEqual(generateHoleRing(RING)[3])
  })

  it('does not duplicate a hole that is nudged twice', () => {
    let roi = nudgeHole(newRoi(), 4, { x: 1, y: 2 })
    roi = nudgeHole(roi, 4, { x: 3, y: 4 })
    expect(roi.nudgedHoles).toEqual([4])
    expect(roi.holes[4]).toEqual({ x: 3, y: 4 })
  })

  it('keeps the nudged list sorted for stable display', () => {
    let roi = nudgeHole(newRoi(), 9, { x: 1, y: 1 })
    roi = nudgeHole(roi, 2, { x: 2, y: 2 })
    expect(roi.nudgedHoles).toEqual([2, 9])
  })

  it('rejects an out-of-range hole', () => {
    expect(() => nudgeHole(newRoi(), 20, { x: 0, y: 0 })).toThrow(/no hole/i)
  })
})

describe('regenerateRing', () => {
  it('clears hand nudges, because they no longer describe the new ring', () => {
    const nudged = nudgeHole(newRoi(), 4, { x: 111, y: 222 })
    const regenerated = regenerateRing(nudged, { ...RING, ringRadius: 190 })
    expect(regenerated.nudgedHoles).toEqual([])
    expect(regenerated.holes[4]).not.toEqual({ x: 111, y: 222 })
  })

  it('keeps the target hole through a regeneration', () => {
    const roi = setTargetHole(newRoi(), 6)
    expect(regenerateRing(roi, { ...RING, ringRadius: 190 }).targetHole).toBe(6)
  })
})

describe('setTargetHole', () => {
  it('marks and clears the escape hole', () => {
    expect(setTargetHole(newRoi(), 3).targetHole).toBe(3)
    expect(setTargetHole(setTargetHole(newRoi(), 3), null).targetHole).toBeNull()
  })

  it('rejects a hole that does not exist', () => {
    expect(() => setTargetHole(newRoi(), 99)).toThrow(/no hole/i)
  })
})

describe('roiPixelsPerCm', () => {
  it('is null until the user supplies a real platform diameter', () => {
    expect(roiPixelsPerCm(newRoi())).toBeNull()
  })

  it('derives the scale once the diameter is entered', () => {
    const roi = setPlatformDiameterCm(newRoi(), 92)
    expect(roiPixelsPerCm(roi)!).toBeCloseTo(440 / 92, 9)
  })

  it('treats a nonsensical diameter as no scale rather than throwing', () => {
    expect(roiPixelsPerCm(setPlatformDiameterCm(newRoi(), 0))).toBeNull()
  })
})

describe('roiCompleteness', () => {
  it('reports exactly what is still missing', () => {
    expect(roiCompleteness(null)).toEqual({
      hasRing: false,
      hasTarget: false,
      hasScale: false,
      isComplete: false,
    })

    const ringOnly = newRoi()
    expect(roiCompleteness(ringOnly)).toMatchObject({
      hasRing: true,
      hasTarget: false,
      hasScale: false,
      isComplete: false,
    })

    const done = setPlatformDiameterCm(setTargetHole(ringOnly, 0), 92)
    expect(roiCompleteness(done).isComplete).toBe(true)
  })
})
