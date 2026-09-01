import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildTimebase,
  formatFps,
  frameIndexAtTime,
  frameTimeSeconds,
  parseTimebase,
  reduceRational,
  type SampleTableEntry,
} from './timebase.ts'

describe('reduceRational', () => {
  it('reduces the raw timescale/delta pair to lowest terms', () => {
    // What the container actually stores for test50/test53.
    expect(reduceRational(15360, 512)).toEqual({ numerator: 30, denominator: 1 })
  })

  it('leaves an already-reduced NTSC-style rate alone', () => {
    expect(reduceRational(15000, 1001)).toEqual({
      numerator: 15000,
      denominator: 1001,
    })
  })
})

describe('buildTimebase', () => {
  it('maps every frame to an exact cumulative time', () => {
    const timebase = buildTimebase(1000, [{ count: 4, delta: 100 }])
    expect(timebase.frameCount).toBe(4)
    expect(Array.from(timebase.frameTicks)).toEqual([0, 100, 200, 300])
    expect(frameTimeSeconds(timebase, 3)).toBeCloseTo(0.3, 10)
    expect(timebase.durationSeconds).toBeCloseTo(0.4, 10)
  })

  it('accumulates across variable deltas rather than assuming one', () => {
    // Frame 2 is short and frame 3 long -- i / fps would misplace both.
    const entries: SampleTableEntry[] = [
      { count: 2, delta: 512 },
      { count: 1, delta: 1 },
      { count: 1, delta: 1023 },
      { count: 2, delta: 512 },
    ]
    const timebase = buildTimebase(15360, entries)
    expect(Array.from(timebase.frameTicks)).toEqual([0, 512, 1024, 1025, 2048, 2560])
    expect(timebase.jitter.isVariable).toBe(true)
    expect(timebase.jitter.modalDelta).toBe(512)
    expect(timebase.jitter.offModalFrames).toBe(2)
    expect(timebase.jitter.distinctDeltas).toBe(3)
    // The modal delta still sets the nominal rate despite the jitter.
    expect(timebase.nominalFps).toEqual({ numerator: 30, denominator: 1 })
  })

  it('reports constant timing as not variable', () => {
    const timebase = buildTimebase(15360, [{ count: 10, delta: 512 }])
    expect(timebase.jitter.isVariable).toBe(false)
    expect(timebase.jitter.offModalFrames).toBe(0)
    expect(timebase.jitter.offModalFraction).toBe(0)
  })

  it('rejects a track with no frames instead of returning a bogus timebase', () => {
    expect(() => buildTimebase(15360, [])).toThrow(/no frames/i)
  })

  it('rejects a nonsensical timescale', () => {
    expect(() => buildTimebase(0, [{ count: 1, delta: 512 }])).toThrow(/timescale/i)
  })
})

describe('frameIndexAtTime', () => {
  const timebase = buildTimebase(1000, [
    { count: 2, delta: 100 },
    { count: 1, delta: 500 },
    { count: 2, delta: 100 },
  ])
  // Frame start ticks: 0, 100, 200, 700, 800.

  it('returns the frame on screen at a given time', () => {
    expect(frameIndexAtTime(timebase, 0)).toBe(0)
    expect(frameIndexAtTime(timebase, 0.15)).toBe(1)
    expect(frameIndexAtTime(timebase, 0.25)).toBe(2)
    // Still frame 2 most of a second later -- the long delta, not a dropped frame.
    expect(frameIndexAtTime(timebase, 0.69)).toBe(2)
    expect(frameIndexAtTime(timebase, 0.7)).toBe(3)
  })

  it('clamps outside the clip rather than throwing', () => {
    expect(frameIndexAtTime(timebase, -5)).toBe(0)
    expect(frameIndexAtTime(timebase, 999)).toBe(4)
  })

  it('round-trips with frameTimeSeconds', () => {
    for (let i = 0; i < timebase.frameCount; i++) {
      expect(frameIndexAtTime(timebase, frameTimeSeconds(timebase, i))).toBe(i)
    }
  })
})

describe('formatFps', () => {
  it('shows an integer rate plainly', () => {
    expect(formatFps({ numerator: 30, denominator: 1 })).toBe('30')
  })

  it('shows the exact rational alongside the decimal for non-integer rates', () => {
    expect(formatFps({ numerator: 15000, denominator: 1001 })).toBe(
      '14.985 (15000/1001)',
    )
  })
})

/**
 * Ground truth measured from the actual sample clips (docs/timebase-findings.md).
 * The rate is asserted as a numerator/denominator pair on purpose: a test
 * asserting ~14.985 passes for any float that is merely close, and exactness is
 * the point.
 */
const SAMPLES = [
  {
    name: 'test50.mp4',
    timescale: 15360,
    frameCount: 5539,
    nominalFps: { numerator: 30, denominator: 1 },
    durationSeconds: 185.066667,
    naiveTrapFps: 29.929755,
  },
  {
    name: 'test51.mp4',
    timescale: 15000,
    frameCount: 741,
    nominalFps: { numerator: 15000, denominator: 1001 },
    durationSeconds: 49.382667,
    naiveTrapFps: 15.005265,
  },
  {
    name: 'test53.mp4',
    timescale: 15360,
    frameCount: 905,
    nominalFps: { numerator: 30, denominator: 1 },
    durationSeconds: 30.233333,
    naiveTrapFps: 29.933848,
  },
] as const

const SAMPLE_DIR = 'data/barnes-maze'
// The clips are deliberately not committed (see .gitignore); CI fetches them
// before running tests. Skipping loudly beats silently passing without them.
const hasSamples = SAMPLES.every((s) => existsSync(`${SAMPLE_DIR}/${s.name}`))

describe.skipIf(!hasSamples)('parseTimebase against the real sample clips', () => {
  for (const sample of SAMPLES) {
    describe(sample.name, () => {
      const bytes = hasSamples
        ? readFileSync(`${SAMPLE_DIR}/${sample.name}`)
        : Buffer.alloc(0)
      const timebase = hasSamples
        ? parseTimebase(
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          )
        : null

      it('reads the container timescale and frame count', () => {
        expect(timebase!.timescale).toBe(sample.timescale)
        expect(timebase!.frameCount).toBe(sample.frameCount)
        expect(timebase!.frameTicks.length).toBe(sample.frameCount)
      })

      it('reports nominal fps as an exact rational', () => {
        expect(timebase!.nominalFps).toEqual(sample.nominalFps)
      })

      it('matches the measured stts duration', () => {
        expect(timebase!.durationSeconds).toBeCloseTo(sample.durationSeconds, 5)
      })

      it('flags the variable frame timing all three clips have', () => {
        expect(timebase!.jitter.isVariable).toBe(true)
        expect(timebase!.jitter.distinctDeltas).toBeGreaterThan(1)
        expect(timebase!.jitter.offModalFraction).toBeGreaterThan(0.05)
        expect(timebase!.jitter.offModalFraction).toBeLessThan(0.15)
      })

      it('does not report the frameCount/duration answer', () => {
        // The documented trap: this is what dividing gives, and for test51 it
        // rounds to 15 -- the exact wrong answer the brief calls out.
        const naive = timebase!.frameCount / timebase!.durationSeconds
        expect(naive).toBeCloseTo(sample.naiveTrapFps, 5)
        const reported =
          timebase!.nominalFps.numerator / timebase!.nominalFps.denominator
        expect(Math.abs(reported - naive)).toBeGreaterThan(0.01)
      })

      it('starts at zero and ends before the clip duration', () => {
        expect(frameTimeSeconds(timebase!, 0)).toBe(0)
        expect(frameTimeSeconds(timebase!, timebase!.frameCount - 1)).toBeLessThan(
          timebase!.durationSeconds,
        )
      })
    })
  }
})

describe('sample fixtures', () => {
  it('is running the ground-truth assertions, not silently skipping them', () => {
    // Fails loudly in CI (which fetches the clips) if the fixtures vanish.
    if (process.env.CI) expect(hasSamples).toBe(true)
    else expect(typeof hasSamples).toBe('boolean')
  })
})
