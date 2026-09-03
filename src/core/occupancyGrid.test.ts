import { describe, expect, it } from 'vitest'
import { computeOccupancyGrid } from './occupancyGrid.ts'
import type { EffectiveFrame } from './corrections.ts'
import type { RoiDefinition } from './roi.ts'
import type { Point } from './geometry.ts'

function makeRoi(): RoiDefinition {
  return {
    center: { x: 100, y: 100 },
    platformRadius: 100,
    ring: { center: { x: 100, y: 100 }, ringRadius: 80, rotation: 0, holeCount: 4 },
    holes: [],
    nudgedHoles: [],
    targetHole: null,
    platformDiameterCm: 20,
    holeRadius: 10,
    source: 'manual',
  }
}

function tracked(frameIndex: number, centroid: Point): EffectiveFrame {
  return { frameIndex, state: 'TRACKED', centroid, nose: centroid, area: 100, holeIndex: null, isCorrected: false }
}

describe('computeOccupancyGrid', () => {
  it('counts frames into the cell their centroid falls in', () => {
    const roi = makeRoi()
    // Platform spans x/y 0..200. Two frames in the same cell near the centre.
    const frames = [tracked(0, { x: 100, y: 100 }), tracked(1, { x: 101, y: 100 })]
    const grid = computeOccupancyGrid(frames, roi, 10)
    const total = grid.counts.flat().reduce((a, b) => a + b, 0)
    expect(total).toBe(2)
    expect(grid.maxCount).toBe(2)
  })

  it('ignores non-TRACKED frames and frames without a centroid', () => {
    const roi = makeRoi()
    const frames: EffectiveFrame[] = [
      { frameIndex: 0, state: 'LOST', centroid: null, nose: null, area: 0, holeIndex: null, isCorrected: false },
      tracked(1, { x: 100, y: 100 }),
    ]
    const grid = computeOccupancyGrid(frames, roi, 10)
    expect(grid.counts.flat().reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('drops a centroid outside the platform bounding box rather than throwing', () => {
    const roi = makeRoi()
    const frames = [tracked(0, { x: -500, y: -500 })]
    const grid = computeOccupancyGrid(frames, roi, 10)
    expect(grid.counts.flat().reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('separates frames in different cells and tracks the busiest one', () => {
    const roi = makeRoi()
    const frames = [
      tracked(0, { x: 10, y: 10 }), // corner cell
      tracked(1, { x: 190, y: 190 }), // opposite corner
      tracked(2, { x: 190, y: 190 }),
    ]
    const grid = computeOccupancyGrid(frames, roi, 10)
    expect(grid.maxCount).toBe(2)
    expect(grid.counts[0]![0]).toBe(1)
    expect(grid.counts[9]![9]).toBe(2)
  })
})
