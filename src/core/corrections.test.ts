import { describe, expect, it } from 'vitest'
import { applyCorrections, type Corrections } from './corrections.ts'
import type { FrameTrack } from './tracking.ts'

function track(overrides: Partial<FrameTrack> = {}): FrameTrack {
  return {
    frameIndex: 0,
    state: 'TRACKED',
    centroid: { x: 10, y: 10 },
    nose: { x: 12, y: 10 },
    area: 100,
    holeIndex: null,
    ...overrides,
  }
}

describe('applyCorrections', () => {
  it('leaves an uncorrected frame exactly as the tracker produced it', () => {
    const tracks = [track({ frameIndex: 0 })]
    const [result] = applyCorrections(tracks, new Map())
    expect(result!.isCorrected).toBe(false)
    expect(result!.centroid).toEqual({ x: 10, y: 10 })
    expect(result!.nose).toEqual({ x: 12, y: 10 })
  })

  it('overrides centroid and nose for a corrected frame', () => {
    const tracks = [track({ frameIndex: 5 })]
    const corrections: Corrections = new Map([
      [5, { centroid: { x: 99, y: 88 }, nose: { x: 95, y: 88 } }],
    ])
    const [result] = applyCorrections(tracks, corrections)
    expect(result!.isCorrected).toBe(true)
    expect(result!.centroid).toEqual({ x: 99, y: 88 })
    expect(result!.nose).toEqual({ x: 95, y: 88 })
  })

  it('falls back to the corrected centroid for nose when only centroid was corrected', () => {
    const tracks = [track({ frameIndex: 5 })]
    const corrections: Corrections = new Map([[5, { centroid: { x: 99, y: 88 }, nose: null }]])
    const [result] = applyCorrections(tracks, corrections)
    expect(result!.nose).toEqual({ x: 99, y: 88 })
  })

  it('does not touch the original tracks array or its records', () => {
    const original = track({ frameIndex: 0, centroid: { x: 1, y: 1 } })
    const tracks = [original]
    applyCorrections(tracks, new Map([[0, { centroid: { x: 99, y: 99 }, nose: null }]]))
    expect(original.centroid).toEqual({ x: 1, y: 1 })
  })

  it('preserves state and hole attribution on uncorrected frames', () => {
    const tracks = [track({ frameIndex: 3, state: 'OCCLUDED_IN_HOLE', centroid: null, nose: null, holeIndex: 4 })]
    const [result] = applyCorrections(tracks, new Map())
    expect(result!.state).toBe('OCCLUDED_IN_HOLE')
    expect(result!.holeIndex).toBe(4)
    expect(result!.centroid).toBeNull()
  })

  it('applies only to the frames that have a correction, in a mixed sequence', () => {
    const tracks = [
      track({ frameIndex: 0, centroid: { x: 1, y: 1 } }),
      track({ frameIndex: 1, centroid: { x: 2, y: 2 } }),
      track({ frameIndex: 2, centroid: { x: 3, y: 3 } }),
    ]
    const corrections: Corrections = new Map([[1, { centroid: { x: 200, y: 200 }, nose: null }]])
    const result = applyCorrections(tracks, corrections)
    expect(result[0]!.isCorrected).toBe(false)
    expect(result[1]!.isCorrected).toBe(true)
    expect(result[1]!.centroid).toEqual({ x: 200, y: 200 })
    expect(result[2]!.isCorrected).toBe(false)
  })
})
