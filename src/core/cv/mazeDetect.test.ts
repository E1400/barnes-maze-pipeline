import { describe, expect, it } from 'vitest'
import { DEFAULT_MAZE_PARAMS, detectMaze, estimateRing, fitCircle } from './mazeDetect.ts'
import { createGray, type GrayFrame } from './types.ts'

const WIDTH = 320
const HEIGHT = 240

interface MazeSpec {
  cx: number
  cy: number
  platformRadius: number
  ringRadius: number
  holeCount: number
  rotation: number
  holeRadius: number
  /** Hole indices to leave out, e.g. one the animal is sitting on. */
  omit?: number[]
}

const BASE: MazeSpec = {
  cx: 160,
  cy: 120,
  platformRadius: 100,
  ringRadius: 82,
  holeCount: 20,
  rotation: 0.1,
  holeRadius: 5,
}

function disc(frame: GrayFrame, cx: number, cy: number, r: number, value: number) {
  const r2 = r * r
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(frame.height - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(frame.width - 1, Math.ceil(cx + r)); x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) frame.data[y * frame.width + x] = value
    }
  }
}

/** A synthetic Barnes maze: bright disc on a dark surround, dark holes on a ring. */
function synthMaze(spec: Partial<MazeSpec> = {}): { frame: GrayFrame; spec: MazeSpec } {
  const s = { ...BASE, ...spec }
  const frame = createGray(WIDTH, HEIGHT, 40) // dark surround
  disc(frame, s.cx, s.cy, s.platformRadius, 190) // platform
  const step = (Math.PI * 2) / s.holeCount
  for (let i = 0; i < s.holeCount; i++) {
    if (s.omit?.includes(i)) continue
    const angle = s.rotation + i * step
    disc(frame, s.cx + s.ringRadius * Math.cos(angle), s.cy + s.ringRadius * Math.sin(angle), s.holeRadius, 55)
  }
  return { frame, spec: s }
}

describe('fitCircle', () => {
  it('recovers a circle from points on its rim', () => {
    const points = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2
      return { x: 50 + 20 * Math.cos(a), y: 30 + 20 * Math.sin(a) }
    })
    const fit = fitCircle(points)!
    expect(fit.center.x).toBeCloseTo(50, 6)
    expect(fit.center.y).toBeCloseTo(30, 6)
    expect(fit.radius).toBeCloseTo(20, 6)
  })

  it('fits from a partial arc, which is what a half-occluded ring gives', () => {
    const points = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 20) * Math.PI * 2
      return { x: 50 + 20 * Math.cos(a), y: 30 + 20 * Math.sin(a) }
    })
    const fit = fitCircle(points)!
    expect(fit.center.x).toBeCloseTo(50, 3)
    expect(fit.center.y).toBeCloseTo(30, 3)
  })

  it('returns null rather than guessing from too few points', () => {
    expect(fitCircle([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull()
  })
})

describe('detectMaze', () => {
  it('finds the centre, platform, ring and all holes without any clicks', () => {
    const { frame, spec } = synthMaze()
    const result = detectMaze(frame)

    expect(result.ok).toBe(true)
    // The centre is the value a user would otherwise have to eyeball.
    expect(result.center.x).toBeCloseTo(spec.cx, 0)
    expect(result.center.y).toBeCloseTo(spec.cy, 0)
    expect(result.platformRadius).toBeGreaterThan(spec.platformRadius - 4)
    expect(result.platformRadius).toBeLessThan(spec.platformRadius + 4)
    expect(result.ringRadius).toBeCloseTo(spec.ringRadius, 0)
    expect(result.holeCount).toBe(20)
    expect(result.holes).toHaveLength(20)
    expect(result.matchedHoles).toBe(20)
    expect(result.holeRadius).toBeGreaterThan(3)
    expect(result.holeRadius).toBeLessThan(8)
  })

  it('places every generated hole on a real hole', () => {
    const { frame, spec } = synthMaze()
    const result = detectMaze(frame)
    const step = (Math.PI * 2) / spec.holeCount
    for (const hole of result.holes) {
      // Every proposed hole should be within a pixel or two of a true hole.
      let best = Infinity
      for (let i = 0; i < spec.holeCount; i++) {
        const a = spec.rotation + i * step
        best = Math.min(
          best,
          Math.hypot(hole.x - (spec.cx + spec.ringRadius * Math.cos(a)), hole.y - (spec.cy + spec.ringRadius * Math.sin(a))),
        )
      }
      expect(best).toBeLessThan(2.5)
    }
  })

  it('still returns a full ring when the animal is covering a hole', () => {
    // The realistic case: one hole is hidden, so it cannot be detected. The
    // ring fit has to supply it rather than returning 19 holes.
    const { frame, spec } = synthMaze({ omit: [7] })
    disc(frame, spec.cx + spec.ringRadius * Math.cos(spec.rotation + 7 * ((Math.PI * 2) / 20)), spec.cy + spec.ringRadius * Math.sin(spec.rotation + 7 * ((Math.PI * 2) / 20)), 7, 60)

    const result = detectMaze(frame)
    expect(result.ok).toBe(true)
    expect(result.holeCount).toBe(20)
    expect(result.holes).toHaveLength(20)
    expect(result.note).toMatch(/placed evenly|Found all/)
  })

  it('is not fooled by the animal sitting in the middle of the platform', () => {
    const { frame, spec } = synthMaze()
    // An elongated dark blob near the centre: the mouse.
    for (let y = spec.cy - 4; y <= spec.cy + 4; y++) {
      for (let x = spec.cx - 14; x <= spec.cx + 14; x++) frame.data[y * WIDTH + x] = 50
    }
    const result = detectMaze(frame)
    expect(result.ok).toBe(true)
    expect(result.center.x).toBeCloseTo(spec.cx, 0)
    expect(result.holeCount).toBe(20)
  })

  it('handles a maze that is off-centre in the frame', () => {
    const { frame, spec } = synthMaze({ cx: 120, cy: 100, platformRadius: 85, ringRadius: 70 })
    const result = detectMaze(frame)
    expect(result.center.x).toBeCloseTo(spec.cx, 0)
    expect(result.center.y).toBeCloseTo(spec.cy, 0)
  })

  it('recovers a different hole count rather than assuming twenty', () => {
    const { frame } = synthMaze({ holeCount: 12, ringRadius: 80, holeRadius: 6 })
    expect(detectMaze(frame).holeCount).toBe(12)
  })

  it('reports failure on a frame with no platform instead of inventing one', () => {
    const blank = createGray(WIDTH, HEIGHT, 40)
    const result = detectMaze(blank)
    expect(result.ok).toBe(false)
    expect(result.note).toMatch(/platform/i)
  })

  it('reports failure when the platform has no holes on it', () => {
    const frame = createGray(WIDTH, HEIGHT, 40)
    disc(frame, 160, 120, 100, 190)
    const result = detectMaze(frame)
    expect(result.ok).toBe(false)
    expect(result.note).toMatch(/holes|ring/i)
  })

  it('respects the hole size limits it is given', () => {
    const { frame } = synthMaze()
    const result = detectMaze(frame, { ...DEFAULT_MAZE_PARAMS, maxHoleAreaPx: 5 })
    expect(result.ok).toBe(false)
  })
})

describe('estimateRing', () => {
  const ringAngles = (count: number, rotation = 0.3) =>
    Array.from({ length: count }, (_, i) => rotation + i * ((Math.PI * 2) / count))

  it('recovers the count and phase of a clean ring', () => {
    const result = estimateRing(ringAngles(20, 0.3), 20)
    expect(result.holeCount).toBe(20)
    // Rotation is only defined modulo one slot: which hole counts as "hole 0"
    // is arbitrary, so 0.3 and 0.3 - slot describe the same ring.
    const slot = (Math.PI * 2) / 20
    const offset = ((result.rotation - 0.3) % slot + slot * 1.5) % slot - slot / 2
    expect(Math.abs(offset)).toBeLessThan(0.01)
  })

  it('is not inflated by one hole detected as two adjacent blobs', () => {
    // The real failure: a split detection creates a tiny angular gap, and a
    // count derived from the smallest gap reported 21 holes for a 20-hole
    // maze, pushing four proposed holes onto bare platform.
    const angles = ringAngles(20)
    angles.push(angles[5]! + 0.02)
    expect(estimateRing(angles, 20).holeCount).toBe(20)
  })

  it('prefers the smallest ring that fits, not a multiple of it', () => {
    // A 20-hole ring sits perfectly on a 40-slot ring too; 20 is the answer.
    expect(estimateRing(ringAngles(20), 20).holeCount).toBe(20)
    expect(estimateRing(ringAngles(12), 20).holeCount).toBe(12)
  })

  it('still finds the count when several holes are missing', () => {
    const angles = ringAngles(20).filter((_, i) => ![3, 4, 11].includes(i))
    expect(estimateRing(angles, 20).holeCount).toBe(20)
  })

  it('falls back rather than calling a few scattered angles a small ring', () => {
    // Two clumps of angles fit a 6- or 8-slot ring on residuals alone; the
    // occupancy floor is what rejects them.
    expect(estimateRing([0, 0.1, 0.15, 3.0, 3.05], 20).holeCount).toBe(20)
  })
})
