import { describe, expect, it } from 'vitest'
import {
  angleFrom,
  distance,
  generateHoleRing,
  isInsidePlatform,
  nearestHoleIndex,
  normalizeAngle,
  pixelsPerCm,
  pxToCm,
  ringFromClicks,
  type Point,
} from './geometry.ts'

const CENTER: Point = { x: 320, y: 240 }

describe('generateHoleRing', () => {
  it('places the requested number of holes evenly around the ring', () => {
    const holes = generateHoleRing({
      center: CENTER,
      ringRadius: 200,
      rotation: 0,
      holeCount: 20,
    })
    expect(holes).toHaveLength(20)
    for (const hole of holes) {
      expect(distance(CENTER, hole)).toBeCloseTo(200, 9)
    }
    // Even spacing: consecutive holes are all the same distance apart.
    const firstGap = distance(holes[0]!, holes[1]!)
    for (let i = 1; i < holes.length; i++) {
      const gap = distance(holes[i]!, holes[(i + 1) % holes.length]!)
      expect(gap).toBeCloseTo(firstGap, 9)
    }
  })

  it('puts hole 0 exactly at the rotation angle', () => {
    const holes = generateHoleRing({
      center: CENTER,
      ringRadius: 100,
      rotation: 0,
      holeCount: 4,
    })
    expect(holes[0]!.x).toBeCloseTo(420, 9)
    expect(holes[0]!.y).toBeCloseTo(240, 9)
    // y grows downward, so a quarter turn puts hole 1 below center on screen.
    expect(holes[1]!.x).toBeCloseTo(320, 9)
    expect(holes[1]!.y).toBeCloseTo(340, 9)
  })

  it('rejects a degenerate ring rather than emitting NaN holes', () => {
    expect(() =>
      generateHoleRing({ center: CENTER, ringRadius: 0, rotation: 0, holeCount: 20 }),
    ).toThrow(/radius/i)
    expect(() =>
      generateHoleRing({ center: CENTER, ringRadius: 10, rotation: 0, holeCount: 0 }),
    ).toThrow(/hole count/i)
  })
})

describe('ringFromClicks', () => {
  it('turns three clicks into a full ring of twenty holes', () => {
    // The whole point of the ROI step: 3 clicks, not 20.
    const { platformRadius, ring, holes } = ringFromClicks(
      CENTER,
      { x: 320, y: 20 }, // platform edge, straight up
      { x: 320, y: 60 }, // a hole, slightly inside the edge
      20,
    )
    expect(platformRadius).toBeCloseTo(220, 9)
    expect(ring.ringRadius).toBeCloseTo(180, 9)
    expect(holes).toHaveLength(20)
  })

  it('lands hole 0 on the hole the user actually clicked', () => {
    const clicked: Point = { x: 500, y: 300 }
    const { holes } = ringFromClicks(CENTER, { x: 560, y: 240 }, clicked, 20)
    expect(holes[0]!.x).toBeCloseTo(clicked.x, 6)
    expect(holes[0]!.y).toBeCloseTo(clicked.y, 6)
  })

  it('generates holes inside the platform when the clicked hole is', () => {
    const { platformRadius, ring, holes } = ringFromClicks(
      CENTER,
      { x: 560, y: 240 },
      { x: 520, y: 240 },
      20,
    )
    expect(ring.ringRadius).toBeLessThan(platformRadius)
    for (const hole of holes) {
      expect(isInsidePlatform(hole, CENTER, platformRadius)).toBe(true)
    }
  })
})

describe('nearestHoleIndex', () => {
  const holes = generateHoleRing({
    center: CENTER,
    ringRadius: 200,
    rotation: 0,
    holeCount: 20,
  })

  it('finds the hole a click is closest to', () => {
    const target = holes[7]!
    expect(nearestHoleIndex(holes, { x: target.x + 3, y: target.y - 2 })).toBe(7)
  })

  it('returns -1 when there are no holes yet', () => {
    expect(nearestHoleIndex([], CENTER)).toBe(-1)
  })
})

describe('angleFrom / normalizeAngle', () => {
  it('measures angles from the +x axis with y growing downward', () => {
    expect(angleFrom(CENTER, { x: 420, y: 240 })).toBeCloseTo(0, 9)
    expect(angleFrom(CENTER, { x: 320, y: 340 })).toBeCloseTo(Math.PI / 2, 9)
  })

  it('wraps negative angles into [0, 2pi)', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 9)
    expect(normalizeAngle(Math.PI * 4)).toBeCloseTo(0, 9)
  })
})

describe('pixelsPerCm', () => {
  it('derives scale from the physical platform diameter', () => {
    // A 92 cm platform (a common Barnes maze size) spanning 440 px.
    const scale = pixelsPerCm(220, 92)
    expect(scale).toBeCloseTo(4.7826, 4)
    // A path of 1000 px is then about 209 cm, not "1000".
    expect(pxToCm(1000, scale)).toBeCloseTo(209.09, 2)
  })

  it('refuses nonsense input rather than producing an infinite scale', () => {
    expect(() => pixelsPerCm(0, 92)).toThrow(/radius/i)
    expect(() => pixelsPerCm(220, 0)).toThrow(/diameter/i)
  })
})
