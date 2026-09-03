import { describe, expect, it } from 'vitest'
import { classifySearchStrategy, DEFAULT_SEARCH_STRATEGY_PARAMS } from './searchStrategy.ts'
import type { EffectiveFrame } from './corrections.ts'
import type { EffectiveInvestigation } from './investigationEdits.ts'
import type { Point } from './geometry.ts'
import type { RoiDefinition } from './roi.ts'

// 8 holes evenly spaced around a ring of radius 100, hole 0 at angle 0 (east),
// increasing clockwise (screen convention, y grows downward).
const HOLE_COUNT = 8
const HOLES: Point[] = Array.from({ length: HOLE_COUNT }, (_, i) => {
  const angle = (i * 2 * Math.PI) / HOLE_COUNT
  return { x: 100 * Math.cos(angle), y: 100 * Math.sin(angle) }
})

function makeRoi(targetHole: number | null = 0): RoiDefinition {
  return {
    center: { x: 0, y: 0 },
    platformRadius: 100,
    ring: { center: { x: 0, y: 0 }, ringRadius: 100, rotation: 0, holeCount: HOLE_COUNT },
    holes: HOLES,
    nudgedHoles: [],
    targetHole,
    platformDiameterCm: 20,
    holeRadius: 10,
    source: 'manual',
  }
}

function tracked(frameIndex: number, centroid: Point): EffectiveFrame {
  return { frameIndex, state: 'TRACKED', centroid, nose: centroid, area: 100, holeIndex: null, isCorrected: false }
}

function investigation(
  holeIndex: number,
  startFrame: number,
  isTarget: boolean,
  id = `i-${startFrame}`,
): EffectiveInvestigation {
  return { id, holeIndex, isTarget, startFrame, endFrame: startFrame + 2, kind: 'proximity', source: 'auto' }
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

describe('classifySearchStrategy: spatial', () => {
  it('classifies a direct path with no errors as spatial', () => {
    const roi = makeRoi(0)
    const start = { x: 0, y: 0 }
    const target = roi.holes[0]!
    const frames: EffectiveFrame[] = []
    for (let i = 0; i <= 10; i++) frames.push(tracked(i, lerp(start, target, i / 10)))
    const investigations = [investigation(0, 10, true)]
    const result = classifySearchStrategy(frames, roi, investigations)
    expect(result?.label).toBe('spatial')
    expect(result?.targetReached).toBe(true)
    expect(result?.errorsBeforeCutoff).toBe(0)
  })

  it('still allows spatial with a small number of errors before the target', () => {
    const roi = makeRoi(0)
    const start = { x: 0, y: 0 }
    const target = roi.holes[0]!
    const frames: EffectiveFrame[] = []
    for (let i = 0; i <= 10; i++) frames.push(tracked(i, lerp(start, target, i / 10)))
    const investigations = [investigation(4, 5, false), investigation(0, 10, true)]
    const result = classifySearchStrategy(frames, roi, investigations, {
      ...DEFAULT_SEARCH_STRATEGY_PARAMS,
      maxErrorsForSpatial: 1,
    })
    expect(result?.label).toBe('spatial')
  })
})

describe('classifySearchStrategy: serial', () => {
  it('classifies a hole-by-hole ring walk in order as serial', () => {
    const roi = makeRoi(4) // target is hole 4, on the far side of the ring
    const frames: EffectiveFrame[] = []
    let frame = 0
    // Winding path through holes 0,1,2,3,4 in order -- not remotely direct,
    // but strictly ordered.
    const waypoints = [{ x: 0, y: 0 }, ...[0, 1, 2, 3, 4].map((i) => roi.holes[i]!)]
    for (let seg = 0; seg < waypoints.length - 1; seg++) {
      for (let t = 0; t <= 10; t++) frames.push(tracked(frame++, lerp(waypoints[seg]!, waypoints[seg + 1]!, t / 10)))
    }
    const investigations = [
      investigation(0, 8, false),
      investigation(1, 19, false),
      investigation(2, 30, false),
      investigation(3, 41, false),
      investigation(4, 52, true),
    ]
    const result = classifySearchStrategy(frames, roi, investigations)
    expect(result?.label).toBe('serial')
    expect(result?.holeOrderScore).toBeGreaterThanOrEqual(DEFAULT_SEARCH_STRATEGY_PARAMS.serialOrderThreshold)
  })

  it('is not diluted by repeated consecutive rows at the same hole', () => {
    // Same ring walk as above, but each hole now gets 3 separate "nose came
    // close" rows in a row instead of 1 -- the raw event count triples, but
    // it's still only 5 distinct visits, and should classify the same way.
    const roi = makeRoi(4)
    const frames: EffectiveFrame[] = []
    let frame = 0
    const waypoints = [{ x: 0, y: 0 }, ...[0, 1, 2, 3, 4].map((i) => roi.holes[i]!)]
    for (let seg = 0; seg < waypoints.length - 1; seg++) {
      for (let t = 0; t <= 10; t++) frames.push(tracked(frame++, lerp(waypoints[seg]!, waypoints[seg + 1]!, t / 10)))
    }
    const investigations = [0, 1, 2, 3, 4].flatMap((hole, i) => {
      const base = 8 + i * 11
      return [0, 1, 2].map((j) => investigation(hole, base + j, hole === 4, `i-${hole}-${j}`))
    })
    const result = classifySearchStrategy(frames, roi, investigations)
    expect(result?.label).toBe('serial')
    expect(result?.holeOrderScore).toBeGreaterThanOrEqual(DEFAULT_SEARCH_STRATEGY_PARAMS.serialOrderThreshold)
  })
})

describe('classifySearchStrategy: random', () => {
  it('classifies a scattered, unordered search as random', () => {
    const roi = makeRoi(4)
    const frames: EffectiveFrame[] = []
    let frame = 0
    // Bounces between non-adjacent holes in no consistent angular direction.
    const order = [0, 5, 2, 7, 1, 4]
    const waypoints = [{ x: 0, y: 0 }, ...order.map((i) => roi.holes[i]!)]
    for (let seg = 0; seg < waypoints.length - 1; seg++) {
      for (let t = 0; t <= 10; t++) frames.push(tracked(frame++, lerp(waypoints[seg]!, waypoints[seg + 1]!, t / 10)))
    }
    const investigations = order.map((holeIndex, i) =>
      investigation(holeIndex, (i + 1) * 11 - 1, holeIndex === 4),
    )
    const result = classifySearchStrategy(frames, roi, investigations)
    expect(result?.label).toBe('random')
  })
})

describe('classifySearchStrategy: target never reached', () => {
  it('falls back to the last tracked frame as the cutoff and still returns a label', () => {
    const roi = makeRoi(4)
    const frames: EffectiveFrame[] = []
    for (let i = 0; i <= 20; i++) frames.push(tracked(i, { x: (i - 10) * 5, y: 0 })) // wanders, never near hole 4
    const investigations = [investigation(0, 5, false), investigation(1, 12, false)]
    const result = classifySearchStrategy(frames, roi, investigations)
    expect(result).not.toBeNull()
    expect(result?.targetReached).toBe(false)
    expect(result?.cutoffFrame).toBe(20) // the last frame, not a target investigation
  })
})

describe('classifySearchStrategy: edge cases', () => {
  it('returns null when no target hole is set -- nothing to classify a search toward', () => {
    const roi = makeRoi(null)
    const frames = [tracked(0, { x: 0, y: 0 }), tracked(1, { x: 10, y: 0 })]
    expect(classifySearchStrategy(frames, roi, [])).toBeNull()
  })

  it('returns null when the animal was never tracked at all', () => {
    const roi = makeRoi(0)
    expect(classifySearchStrategy([], roi, [])).toBeNull()
  })
})
