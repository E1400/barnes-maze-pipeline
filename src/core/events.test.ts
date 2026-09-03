import { describe, expect, it } from 'vitest'
import { DEFAULT_INVESTIGATION_PARAMS, detectInvestigations } from './events.ts'
import type { EffectiveFrame } from './corrections.ts'
import type { Point } from './geometry.ts'

const HOLES: Point[] = [
  { x: 100, y: 100 }, // hole 0
  { x: 300, y: 100 }, // hole 1 (target in most tests)
]

function roi(targetHole: number | null = 1) {
  return { holes: HOLES, holeRadius: 10, targetHole }
}

function tracked(frameIndex: number, nose: Point): EffectiveFrame {
  return {
    frameIndex,
    state: 'TRACKED',
    centroid: nose,
    nose,
    area: 100,
    holeIndex: null,
    isCorrected: false,
  }
}

function occluded(frameIndex: number, holeIndex: number): EffectiveFrame {
  return {
    frameIndex,
    state: 'OCCLUDED_IN_HOLE',
    centroid: null,
    nose: null,
    area: 0,
    holeIndex,
    isCorrected: false,
  }
}

function lost(frameIndex: number): EffectiveFrame {
  return { frameIndex, state: 'LOST', centroid: null, nose: null, area: 0, holeIndex: null, isCorrected: false }
}

describe('detectInvestigations: proximity', () => {
  it('reports a sustained nose-near-hole run as an investigation', () => {
    const frames = [
      tracked(0, { x: 200, y: 100 }), // far from both holes
      tracked(1, { x: 105, y: 100 }), // near hole 0
      tracked(2, { x: 103, y: 100 }),
      tracked(3, { x: 104, y: 100 }),
    ]
    const events = detectInvestigations(frames, roi(), DEFAULT_INVESTIGATION_PARAMS)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ holeIndex: 0, isTarget: false, startFrame: 1, endFrame: 3, kind: 'proximity' })
  })

  it('does not report a run shorter than minFrames', () => {
    const frames = [tracked(0, { x: 105, y: 100 }), tracked(1, { x: 104, y: 100 })]
    const events = detectInvestigations(frames, roi(), { proximityRadiusFactor: 1.5, minFrames: 3 })
    expect(events).toHaveLength(0)
  })

  it('marks the target hole correctly', () => {
    const frames = [tracked(0, { x: 305, y: 100 }), tracked(1, { x: 302, y: 100 }), tracked(2, { x: 303, y: 100 })]
    const events = detectInvestigations(frames, roi(1), DEFAULT_INVESTIGATION_PARAMS)
    expect(events[0]).toMatchObject({ holeIndex: 1, isTarget: true })
  })

  it('splits into separate investigations when the animal moves to a different hole', () => {
    const frames = [
      tracked(0, { x: 105, y: 100 }),
      tracked(1, { x: 104, y: 100 }),
      tracked(2, { x: 103, y: 100 }),
      tracked(3, { x: 200, y: 100 }), // moves away, in between
      tracked(4, { x: 302, y: 100 }),
      tracked(5, { x: 303, y: 100 }),
      tracked(6, { x: 304, y: 100 }),
    ]
    const events = detectInvestigations(frames, roi(), DEFAULT_INVESTIGATION_PARAMS)
    expect(events).toHaveLength(2)
    expect(events[0]!.holeIndex).toBe(0)
    expect(events[1]!.holeIndex).toBe(1)
  })

  it('does not detect anything when the nose never gets close enough', () => {
    const frames = [tracked(0, { x: 200, y: 200 }), tracked(1, { x: 210, y: 210 }), tracked(2, { x: 190, y: 190 })]
    expect(detectInvestigations(frames, roi(), DEFAULT_INVESTIGATION_PARAMS)).toHaveLength(0)
  })

  it('ignores LOST frames without crashing and does not bridge a run across them', () => {
    const frames = [
      tracked(0, { x: 105, y: 100 }),
      tracked(1, { x: 104, y: 100 }),
      lost(2),
      tracked(3, { x: 103, y: 100 }),
    ]
    // The run breaks at the LOST frame; neither side alone reaches minFrames (3).
    const events = detectInvestigations(frames, roi(), DEFAULT_INVESTIGATION_PARAMS)
    expect(events).toHaveLength(0)
  })

  it('the proximity threshold is respected: wider factor finds a farther nose, narrower does not', () => {
    // Nose sits at distance 20 from hole 0 (holeRadius 10) -- 2x hole radius.
    const frames = [tracked(0, { x: 120, y: 100 }), tracked(1, { x: 120, y: 100 }), tracked(2, { x: 120, y: 100 })]
    expect(detectInvestigations(frames, roi(), { proximityRadiusFactor: 1.5, minFrames: 3 })).toHaveLength(0)
    expect(detectInvestigations(frames, roi(), { proximityRadiusFactor: 2.5, minFrames: 3 })).toHaveLength(1)
  })
})

describe('detectInvestigations: occlusion', () => {
  it('reports an OCCLUDED_IN_HOLE run as an investigation regardless of minFrames', () => {
    const frames = [tracked(0, { x: 200, y: 100 }), occluded(1, 0)] // just 1 frame
    const events = detectInvestigations(frames, roi(), { proximityRadiusFactor: 1.5, minFrames: 10 })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ holeIndex: 0, kind: 'occlusion', startFrame: 1, endFrame: 1 })
  })

  it('does not double-report frames already covered by an occlusion as a separate proximity event', () => {
    const frames = [
      tracked(0, { x: 105, y: 100 }), // approach, shrinking toward hole 0
      occluded(1, 0),
      occluded(2, 0),
    ]
    const events = detectInvestigations(frames, roi(), DEFAULT_INVESTIGATION_PARAMS)
    expect(events).toHaveLength(1)
    expect(events[0]!.kind).toBe('occlusion')
  })

  it('merges a multi-frame occlusion at the same hole into one event', () => {
    const frames = [occluded(0, 0), occluded(1, 0), occluded(2, 0)]
    const events = detectInvestigations(frames, roi(), DEFAULT_INVESTIGATION_PARAMS)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ startFrame: 0, endFrame: 2 })
  })

  it('splits occlusions at different holes into separate events', () => {
    const frames = [occluded(0, 0), occluded(1, 0), occluded(2, 1), occluded(3, 1)]
    const events = detectInvestigations(frames, roi(), DEFAULT_INVESTIGATION_PARAMS)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ holeIndex: 0, startFrame: 0, endFrame: 1 })
    expect(events[1]).toMatchObject({ holeIndex: 1, startFrame: 2, endFrame: 3 })
  })
})

describe('detectInvestigations: ordering and edge cases', () => {
  it('returns events in ascending start-frame order', () => {
    const frames = [
      tracked(0, { x: 302, y: 100 }),
      tracked(1, { x: 303, y: 100 }),
      tracked(2, { x: 304, y: 100 }),
      tracked(3, { x: 200, y: 100 }),
      tracked(4, { x: 105, y: 100 }),
      tracked(5, { x: 104, y: 100 }),
      tracked(6, { x: 103, y: 100 }),
    ]
    const events = detectInvestigations(frames, roi(), DEFAULT_INVESTIGATION_PARAMS)
    expect(events.map((e) => e.startFrame)).toEqual([0, 4])
  })

  it('handles an empty track', () => {
    expect(detectInvestigations([], roi(), DEFAULT_INVESTIGATION_PARAMS)).toEqual([])
  })

  it('handles a null targetHole by marking every investigation non-target', () => {
    const frames = [tracked(0, { x: 105, y: 100 }), tracked(1, { x: 104, y: 100 }), tracked(2, { x: 103, y: 100 })]
    const events = detectInvestigations(frames, roi(null), DEFAULT_INVESTIGATION_PARAMS)
    expect(events[0]!.isTarget).toBe(false)
  })
})
