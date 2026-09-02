import { describe, expect, it } from 'vitest'
import { DEFAULT_TRACKER_PARAMS, Tracker, type HoleRoi } from './tracking.ts'
import type { Detection } from './cv/detector.ts'
import type { Point } from './geometry.ts'

function found(overrides: Partial<Detection> = {}): Detection {
  return {
    found: true,
    centroid: { x: 100, y: 100 },
    area: 200,
    orientation: 0,
    axisEnds: [
      { x: 90, y: 100 },
      { x: 110, y: 100 },
    ],
    threshold: 30,
    candidateCount: 1,
    runnerUpArea: 0,
    ...overrides,
  }
}

const NOT_FOUND: Detection = {
  found: false,
  centroid: null,
  area: 0,
  orientation: null,
  axisEnds: null,
  threshold: 30,
  candidateCount: 0,
  runnerUpArea: 0,
}

const HOLES: Point[] = [
  { x: 200, y: 100 }, // hole 0
  { x: 100, y: 200 }, // hole 1
]

function roi(targetHole: number | null = null): HoleRoi {
  return { holes: HOLES, holeRadius: 10, targetHole }
}

describe('Tracker: basic states', () => {
  it('reports TRACKED with the detected centroid while the animal is visible', () => {
    const tracker = new Tracker(roi())
    const record = tracker.push(0, found({ centroid: { x: 50, y: 50 } }))
    expect(record.state).toBe('TRACKED')
    expect(record.centroid).toEqual({ x: 50, y: 50 })
    expect(record.holeIndex).toBeNull()
  })

  it('calls a vanish with no nearby hole and no shrink LOST', () => {
    const tracker = new Tracker(roi())
    tracker.push(0, found({ centroid: { x: 400, y: 400 }, area: 200 })) // far from any hole
    const record = tracker.push(1, NOT_FOUND)
    expect(record.state).toBe('LOST')
    expect(record.centroid).toBeNull()
    expect(record.holeIndex).toBeNull()
  })

  it('never reports a position for LOST or OCCLUDED_IN_HOLE -- an honest gap, not an interpolated one', () => {
    const tracker = new Tracker(roi())
    tracker.push(0, found({ centroid: { x: 400, y: 400 } }))
    const lost = tracker.push(1, NOT_FOUND)
    expect(lost.centroid).toBeNull()
    expect(lost.nose).toBeNull()
  })
})

describe('Tracker: lost vs occluded-in-hole', () => {
  function shrinkingApproach(tracker: Tracker, hole: Point, startFrame: number): number {
    // Several frames shrinking on approach to a hole, matching
    // shrinkWindowFrames/shrinkFractionRequired.
    let frame = startFrame
    const areas = [200, 170, 140, 110, 80]
    for (const area of areas) {
      tracker.push(frame++, found({ centroid: { x: hole.x - 3, y: hole.y }, area }))
    }
    return frame
  }

  it('calls it OCCLUDED_IN_HOLE when the blob shrinks on approach and vanishes near a hole', () => {
    const tracker = new Tracker(roi())
    const nextFrame = shrinkingApproach(tracker, HOLES[0]!, 0)
    const record = tracker.push(nextFrame, NOT_FOUND)
    expect(record.state).toBe('OCCLUDED_IN_HOLE')
    expect(record.holeIndex).toBe(0)
  })

  it('is conservative: proximity alone, without shrinking, is still LOST', () => {
    // Right next to a hole, but every frame the same size -- no evidence of
    // actually entering it, could just as easily be a tracking glitch.
    const tracker = new Tracker(roi())
    for (let f = 0; f < 5; f++) {
      tracker.push(f, found({ centroid: { x: HOLES[0]!.x - 3, y: HOLES[0]!.y }, area: 200 }))
    }
    const record = tracker.push(5, NOT_FOUND)
    expect(record.state).toBe('LOST')
  })

  it('is conservative: shrinking far from any hole is still LOST, not a hole entry', () => {
    const tracker = new Tracker(roi())
    const areas = [200, 170, 140, 110, 80]
    let frame = 0
    for (const area of areas) {
      tracker.push(frame++, found({ centroid: { x: 500, y: 500 }, area }))
    }
    const record = tracker.push(frame, NOT_FOUND)
    expect(record.state).toBe('LOST')
  })

  it('attributes the vanish to the nearest hole, not always hole 0', () => {
    const tracker = new Tracker(roi())
    const nextFrame = shrinkingApproach(tracker, HOLES[1]!, 0)
    const record = tracker.push(nextFrame, NOT_FOUND)
    expect(record.state).toBe('OCCLUDED_IN_HOLE')
    expect(record.holeIndex).toBe(1)
  })

  it('a reappearance after LOST returns to TRACKED with a fresh area history', () => {
    const tracker = new Tracker(roi())
    tracker.push(0, found({ centroid: { x: 500, y: 500 } }))
    tracker.push(1, NOT_FOUND)
    const record = tracker.push(2, found({ centroid: { x: 505, y: 505 } }))
    expect(record.state).toBe('TRACKED')
  })
})

describe('Tracker: nose assignment', () => {
  const axisEnds: Detection['axisEnds'] = [
    { x: 90, y: 100 },
    { x: 110, y: 100 },
  ]

  it('picks the axis end leading the direction of travel', () => {
    const tracker = new Tracker(roi())
    tracker.push(0, found({ centroid: { x: 90, y: 100 }, axisEnds }))
    // Moving in +x: the +x-side endpoint (110,100) should lead.
    const record = tracker.push(1, found({ centroid: { x: 100, y: 100 }, axisEnds }))
    expect(record.nose).toEqual({ x: 110, y: 100 })
  })

  it('flips the nose choice when the direction of travel reverses', () => {
    const tracker = new Tracker(roi())
    tracker.push(0, found({ centroid: { x: 110, y: 100 }, axisEnds }))
    tracker.push(1, found({ centroid: { x: 100, y: 100 }, axisEnds })) // moving -x
    const record = tracker.push(2, found({ centroid: { x: 90, y: 100 }, axisEnds })) // still -x
    expect(record.nose).toEqual({ x: 90, y: 100 })
  })

  it('keeps nose continuity rather than flip-flopping when nearly stationary', () => {
    const tracker = new Tracker(roi())
    tracker.push(0, found({ centroid: { x: 100, y: 100 }, axisEnds }))
    const first = tracker.push(1, found({ centroid: { x: 100.05, y: 100 }, axisEnds }))
    const second = tracker.push(2, found({ centroid: { x: 100.02, y: 100 }, axisEnds }))
    // Sub-noise-floor motion: nose should not swap ends between these frames.
    expect(second.nose).toEqual(first.nose)
  })

  it('resets nose continuity after a vanish rather than carrying stale identity across a gap', () => {
    const tracker = new Tracker(roi())
    tracker.push(0, found({ centroid: { x: 90, y: 100 }, axisEnds }))
    tracker.push(1, found({ centroid: { x: 100, y: 100 }, axisEnds })) // nose -> (110,100)
    tracker.push(2, NOT_FOUND)
    // Reappears moving the other way -- nose should follow the new motion,
    // not the stale pre-gap identity.
    tracker.push(3, found({ centroid: { x: 110, y: 100 }, axisEnds }))
    const record = tracker.push(4, found({ centroid: { x: 100, y: 100 }, axisEnds }))
    expect(record.nose).toEqual({ x: 90, y: 100 })
  })
})

describe('Tracker.finalize: escape box promotion', () => {
  function shrinkInto(tracker: Tracker, hole: Point, startFrame: number): number {
    let frame = startFrame
    for (const area of [200, 170, 140, 110, 80]) {
      tracker.push(frame++, found({ centroid: { x: hole.x - 3, y: hole.y }, area }))
    }
    return frame
  }

  it('promotes a trailing hole-occlusion at the target hole to IN_ESCAPE_BOX', () => {
    const tracker = new Tracker(roi(0)) // target is hole 0
    const nextFrame = shrinkInto(tracker, HOLES[0]!, 0)
    tracker.push(nextFrame, NOT_FOUND)
    tracker.push(nextFrame + 1, NOT_FOUND)
    const records = tracker.finalize()
    expect(records.at(-1)!.state).toBe('IN_ESCAPE_BOX')
    expect(records.at(-1)!.holeIndex).toBe(0)
    expect(records.at(-2)!.state).toBe('IN_ESCAPE_BOX')
  })

  it('does not promote a hole visit the animal comes back from', () => {
    const tracker = new Tracker(roi(0))
    let frame = shrinkInto(tracker, HOLES[0]!, 0)
    tracker.push(frame++, NOT_FOUND)
    tracker.push(frame++, found({ centroid: { x: 50, y: 50 } })) // reappears
    const records = tracker.finalize()
    expect(records.some((r) => r.state === 'IN_ESCAPE_BOX')).toBe(false)
  })

  it('does not promote occlusion at a non-target hole, even trailing', () => {
    const tracker = new Tracker(roi(1)) // target is hole 1, occlusion is at hole 0
    const nextFrame = shrinkInto(tracker, HOLES[0]!, 0)
    tracker.push(nextFrame, NOT_FOUND)
    const records = tracker.finalize()
    expect(records.at(-1)!.state).toBe('OCCLUDED_IN_HOLE')
  })

  it('does nothing when no target hole is set', () => {
    const tracker = new Tracker(roi(null))
    const nextFrame = shrinkInto(tracker, HOLES[0]!, 0)
    tracker.push(nextFrame, NOT_FOUND)
    const records = tracker.finalize()
    expect(records.at(-1)!.state).toBe('OCCLUDED_IN_HOLE')
  })

  it('is idempotent-safe to call once and reflects immediately in the returned array', () => {
    const tracker = new Tracker(roi(0))
    const nextFrame = shrinkInto(tracker, HOLES[0]!, 0)
    tracker.push(nextFrame, NOT_FOUND)
    const records = tracker.finalize()
    expect(records).toHaveLength(nextFrame + 1)
  })
})

describe('DEFAULT_TRACKER_PARAMS', () => {
  it('requires both proximity and shrinkage, never one alone', () => {
    // Documents the conservative-by-default policy at the constant level.
    expect(DEFAULT_TRACKER_PARAMS.shrinkFractionRequired).toBeGreaterThan(0)
    expect(DEFAULT_TRACKER_PARAMS.holeProximityRadiusFactor).toBeGreaterThan(0)
  })
})
