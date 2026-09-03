import { describe, expect, it } from 'vitest'
import { computeTrialMeasures, computeTrialMeasuresFromInvestigations } from './measures.ts'
import type { EffectiveFrame } from './corrections.ts'
import {
  addManualInvestigation,
  applyInvestigationEdits,
  EMPTY_INVESTIGATION_EDITS,
} from './investigationEdits.ts'
import type { RoiDefinition } from './roi.ts'
import { buildTimebase } from './timebase.ts'
import type { Point } from './geometry.ts'

// 30fps, constant timing, 20 frames -- frame i lands at i/30 seconds.
const TIMEBASE = buildTimebase(30, [{ count: 20, delta: 1 }])

// Four holes at N/E/S/W, ring radius 100 around the origin. Hole 0 (east,
// angle 0) is the target unless a test overrides it.
const HOLES: Point[] = [
  { x: 100, y: 0 }, // 0: target, angle 0
  { x: 0, y: 100 }, // 1: angle 90 (clockwise from target, screen convention)
  { x: -100, y: 0 }, // 2: angle 180, opposite
  { x: 0, y: -100 }, // 3: angle 270, counter-clockwise from target
]

function makeRoi(overrides: Partial<RoiDefinition> = {}): RoiDefinition {
  return {
    center: { x: 0, y: 0 },
    platformRadius: 100,
    ring: { center: { x: 0, y: 0 }, ringRadius: 100, rotation: 0, holeCount: 4 },
    holes: HOLES,
    nudgedHoles: [],
    targetHole: 0,
    platformDiameterCm: 20, // platformRadius 100px == 10cm radius -> 10 px/cm
    holeRadius: 10,
    source: 'manual',
    ...overrides,
  }
}

function tracked(frameIndex: number, centroid: Point): EffectiveFrame {
  return { frameIndex, state: 'TRACKED', centroid, nose: centroid, area: 100, holeIndex: null, isCorrected: false }
}
function occluded(frameIndex: number, holeIndex: number): EffectiveFrame {
  return { frameIndex, state: 'OCCLUDED_IN_HOLE', centroid: null, nose: null, area: 0, holeIndex, isCorrected: false }
}
function escaped(frameIndex: number): EffectiveFrame {
  return { frameIndex, state: 'IN_ESCAPE_BOX', centroid: null, nose: null, area: 0, holeIndex: null, isCorrected: false }
}
function lost(frameIndex: number): EffectiveFrame {
  return { frameIndex, state: 'LOST', centroid: null, nose: null, area: 0, holeIndex: null, isCorrected: false }
}

describe('computeTrialMeasures: latency', () => {
  it('reports primary latency as the time of the first target investigation', () => {
    const frames = [
      tracked(0, { x: 0, y: 0 }),
      tracked(1, { x: 50, y: 0 }),
      tracked(2, { x: 95, y: 0 }), // near hole 0 (target)
      tracked(3, { x: 96, y: 0 }),
      tracked(4, { x: 97, y: 0 }),
    ]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.primaryLatencySeconds).toBeCloseTo(2 / 30, 6)
  })

  it('reports total latency as the time of the first IN_ESCAPE_BOX frame', () => {
    const frames = [tracked(0, { x: 0, y: 0 }), occluded(1, 0), escaped(2), escaped(3)]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.totalLatencySeconds).toBeCloseTo(2 / 30, 6)
  })

  it('is null when the target was never investigated / the animal never escaped', () => {
    const frames = [tracked(0, { x: 0, y: 0 }), tracked(1, { x: 0, y: 0 })]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.primaryLatencySeconds).toBeNull()
    expect(measures.totalLatencySeconds).toBeNull()
  })
})

describe('computeTrialMeasures: errors', () => {
  it('counts non-target investigations before the target as primary errors, and all of them as total errors', () => {
    const frames = [
      // Investigate hole 2 (non-target) first.
      tracked(0, { x: -95, y: 0 }),
      tracked(1, { x: -96, y: 0 }),
      tracked(2, { x: -97, y: 0 }),
      tracked(3, { x: 0, y: 0 }),
      // Then the target, hole 0.
      tracked(4, { x: 95, y: 0 }),
      tracked(5, { x: 96, y: 0 }),
      tracked(6, { x: 97, y: 0 }),
      tracked(7, { x: 0, y: 0 }),
      // Then another non-target hole, hole 1, after the target was found.
      tracked(8, { x: 0, y: 95 }),
      tracked(9, { x: 0, y: 96 }),
      tracked(10, { x: 0, y: 97 }),
    ]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.primaryErrors).toBe(1)
    expect(measures.totalErrors).toBe(2)
  })

  it('counts every non-target investigation as a primary error when the target is never found', () => {
    const frames = [
      tracked(0, { x: -95, y: 0 }),
      tracked(1, { x: -96, y: 0 }),
      tracked(2, { x: -97, y: 0 }),
    ]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.primaryErrors).toBe(1)
    expect(measures.totalErrors).toBe(1)
  })

  it('counts a hole visited repeatedly as one error, not one per investigation event', () => {
    const frames = [
      // Two separate visits to hole 2 (non-target), with a trip away in between.
      tracked(0, { x: -95, y: 0 }),
      tracked(1, { x: -96, y: 0 }),
      tracked(2, { x: -97, y: 0 }),
      tracked(3, { x: 0, y: 0 }),
      tracked(4, { x: -95, y: 0 }),
      tracked(5, { x: -96, y: 0 }),
      tracked(6, { x: -97, y: 0 }),
    ]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.investigations.length).toBe(2) // two distinct investigation events
    expect(measures.totalErrors).toBe(1) // but one distinct hole
  })
})

describe('computeTrialMeasures: path length and speed', () => {
  it('converts pixel distance to cm using the platform calibration', () => {
    const frames = [tracked(0, { x: 0, y: 0 }), tracked(1, { x: 10, y: 0 }), tracked(2, { x: 20, y: 0 })]
    // 10 px/cm (platformRadius 100px / platformDiameterCm 20 * 2... see makeRoi comment)
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.pathLengthCm).toBeCloseTo(2, 6) // 20px / 10px-per-cm
  })

  it('is null before the platform is calibrated', () => {
    const frames = [tracked(0, { x: 0, y: 0 }), tracked(1, { x: 10, y: 0 })]
    const measures = computeTrialMeasures(frames, makeRoi({ platformDiameterCm: null }), TIMEBASE)
    expect(measures.pathLengthCm).toBeNull()
    expect(measures.averageSpeedCmPerSecond).toBeNull()
  })

  it('does not sum distance across a gap between non-consecutive frame indices', () => {
    const frames = [
      tracked(0, { x: 0, y: 0 }),
      tracked(1, { x: 10, y: 0 }),
      // frame 2 is missing (a real gap, e.g. dropped from the array)
      tracked(3, { x: 1000, y: 1000 }),
    ]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.pathLengthCm).toBeCloseTo(1, 6) // only the 0->1 segment counts
  })

  it('excludes LOST/OCCLUDED segments from path length', () => {
    const frames = [tracked(0, { x: 0, y: 0 }), lost(1), tracked(2, { x: 1000, y: 1000 })]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.pathLengthCm).toBe(0)
    expect(measures.averageSpeedCmPerSecond).toBeNull()
  })

  it('computes average speed from elapsed time of only the contributing segments', () => {
    // Two TRACKED segments, each spanning 1/30s at 30fps: 10px then 10px = 20px = 2cm over 2/30s.
    const frames = [tracked(0, { x: 0, y: 0 }), tracked(1, { x: 10, y: 0 }), tracked(2, { x: 20, y: 0 })]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.averageSpeedCmPerSecond).toBeCloseTo(2 / (2 / 30), 6)
  })
})

describe('computeTrialMeasures: quadrant time', () => {
  it('is null until a target hole is set', () => {
    const frames = [tracked(0, { x: 100, y: 0 })]
    const measures = computeTrialMeasures(frames, makeRoi({ targetHole: null }), TIMEBASE)
    expect(measures.quadrantTimeSeconds).toBeNull()
  })

  it('attributes TRACKED frame time to the quadrant the centroid falls in', () => {
    const frames = [
      tracked(0, { x: 100, y: 0 }), // at the target hole itself -> target quadrant
      tracked(1, { x: 0, y: 100 }), // at hole 1 -> adjacentClockwise
      tracked(2, { x: -100, y: 0 }), // at hole 2 -> opposite
      tracked(3, { x: 0, y: -100 }), // at hole 3 -> adjacentCounterClockwise
    ]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    const q = measures.quadrantTimeSeconds!
    expect(q.target).toBeCloseTo(1 / 30, 6)
    expect(q.adjacentClockwise).toBeCloseTo(1 / 30, 6)
    expect(q.opposite).toBeCloseTo(1 / 30, 6)
    expect(q.adjacentCounterClockwise).toBeCloseTo(1 / 30, 6)
  })

  it('attributes OCCLUDED_IN_HOLE time to that hole’s own quadrant, a known point, not a guess', () => {
    const frames = [occluded(0, 2)] // hole 2 is in the opposite quadrant
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.quadrantTimeSeconds!.opposite).toBeCloseTo(1 / 30, 6)
    expect(measures.quadrantTimeSeconds!.target).toBe(0)
  })

  it('attributes IN_ESCAPE_BOX time to the target quadrant', () => {
    const frames = [escaped(0)]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.quadrantTimeSeconds!.target).toBeCloseTo(1 / 30, 6)
  })

  it('excludes LOST time entirely rather than guessing a quadrant', () => {
    const frames = [lost(0), lost(1)]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    const q = measures.quadrantTimeSeconds!
    expect(q.target + q.opposite + q.adjacentClockwise + q.adjacentCounterClockwise).toBe(0)
  })
})

describe('computeTrialMeasures: edge cases', () => {
  it('handles an empty track without crashing', () => {
    const measures = computeTrialMeasures([], makeRoi(), TIMEBASE)
    expect(measures.primaryLatencySeconds).toBeNull()
    expect(measures.totalLatencySeconds).toBeNull()
    expect(measures.primaryErrors).toBe(0)
    expect(measures.totalErrors).toBe(0)
    expect(measures.pathLengthCm).toBe(0)
    expect(measures.investigations).toEqual([])
  })

  it('exposes the raw investigations list alongside the aggregated measures', () => {
    const frames = [tracked(0, { x: 95, y: 0 }), tracked(1, { x: 96, y: 0 }), tracked(2, { x: 97, y: 0 })]
    const measures = computeTrialMeasures(frames, makeRoi(), TIMEBASE)
    expect(measures.investigations).toHaveLength(1)
    expect(measures.investigations[0]!.isTarget).toBe(true)
  })
})

describe('computeTrialMeasuresFromInvestigations: reviewer edits change the numbers', () => {
  it('a manually added target investigation produces a primary latency the detector alone did not', () => {
    // The animal reaches the target at frame 10 but the auto-detector never
    // confirms it (e.g. below threshold); a reviewer marks it by hand.
    const frames = Array.from({ length: 15 }, (_, i) => tracked(i, { x: 0, y: 0 }))
    const roi = makeRoi()
    const edits = addManualInvestigation(EMPTY_INVESTIGATION_EDITS, {
      id: 'm1',
      holeIndex: 0,
      startFrame: 10,
      endFrame: 12,
    })
    const effective = applyInvestigationEdits([], edits, roi.targetHole)
    const measures = computeTrialMeasuresFromInvestigations(frames, roi, TIMEBASE, effective)
    expect(measures.primaryLatencySeconds).toBeCloseTo(10 / 30, 6)
    expect(measures.investigations[0]).toMatchObject({ id: 'm1', source: 'manual' })
  })
})
