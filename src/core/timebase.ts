/**
 * Timebase: exact frame -> presentation-time mapping, read from the MP4
 * container rather than assumed.
 *
 * Why this module exists at all, in one paragraph: `HTMLVideoElement` exposes
 * `duration` and nothing else -- no frame rate, no frame count, no per-frame
 * times. The obvious workaround, `frameCount / duration`, produces 15.005 for
 * `test51.mp4`, which rounds to "15 fps" and is exactly the wrong answer the
 * brief warns about, arrived at by a route that looks like measurement. All
 * three sample clips also have *variable* frame timing -- 9-11% of frames sit
 * at a delta other than the modal one -- so no single constant delta describes
 * any of them. See `docs/timebase-findings.md` for the measured ground truth.
 *
 * So: parse the container's `stts` (time-to-sample) table, build exact
 * per-frame times by cumulative sum of integer ticks, and report nominal fps
 * as an exact rational (`timescale / modalDelta`), never a float.
 */

import { createFile } from 'mp4box'

/** An exact fraction. 15000/1001, not 14.985015. */
export interface Rational {
  readonly numerator: number
  readonly denominator: number
}

/** One run-length entry of an MP4 `stts` table: `count` frames of `delta` ticks. */
export interface SampleTableEntry {
  readonly count: number
  readonly delta: number
}

/**
 * How far the file departs from constant frame timing. Surfaced in the quality
 * report rather than hidden -- a file whose frames are not evenly spaced is
 * something the analyst should know about.
 */
export interface TimingJitter {
  /** The most common inter-frame delta, in ticks. Denominator of nominal fps. */
  readonly modalDelta: number
  /** Frames whose delta differs from the modal one. */
  readonly offModalFrames: number
  /** `offModalFrames / frameCount`, 0 for perfectly constant timing. */
  readonly offModalFraction: number
  /** Number of distinct deltas present. 1 means constant frame timing. */
  readonly distinctDeltas: number
  /** True when the file does not have a single constant frame delta. */
  readonly isVariable: boolean
}

export interface Timebase {
  /** Ticks per second for this track (`mdhd` timescale). */
  readonly timescale: number
  readonly frameCount: number
  /** `timescale / modalDelta`, reduced. Exact: 30/1, 15000/1001. */
  readonly nominalFps: Rational
  /** Sum of all `stts` deltas, in ticks. Integer, so exact. */
  readonly durationTicks: number
  readonly durationSeconds: number
  /**
   * Cumulative start tick of each frame: `frameTicks[i]` is the sum of all
   * deltas before frame `i`. Integers, so the mapping stays exact; divide by
   * `timescale` for seconds via `frameTimeSeconds`.
   */
  readonly frameTicks: Float64Array
  readonly jitter: TimingJitter
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = y
    y = x % y
    x = t
  }
  return x
}

/** Reduces a fraction to lowest terms, e.g. 15360/512 -> 30/1. */
export function reduceRational(numerator: number, denominator: number): Rational {
  const divisor = greatestCommonDivisor(numerator, denominator) || 1
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

/**
 * Decimal value of a rational. For display and comparison only -- never store
 * this back as the frame rate, which is the whole point of keeping the pair.
 */
export function rationalToNumber(rational: Rational): number {
  return rational.numerator / rational.denominator
}

/** e.g. "30" for 30/1, "14.985 (15000/1001)" for a non-integer rate. */
export function formatFps(rational: Rational): string {
  if (rational.denominator === 1) return String(rational.numerator)
  const decimal = rationalToNumber(rational).toFixed(3)
  return `${decimal} (${rational.numerator}/${rational.denominator})`
}

/**
 * Builds the exact timebase from a track's timescale and `stts` table.
 *
 * Pure: takes plain numbers, so it is unit-testable without touching a file.
 */
export function buildTimebase(
  timescale: number,
  entries: readonly SampleTableEntry[],
): Timebase {
  if (!Number.isFinite(timescale) || timescale <= 0) {
    throw new Error(`Invalid media timescale: ${timescale}`)
  }

  let frameCount = 0
  for (const entry of entries) frameCount += entry.count
  if (frameCount === 0) {
    throw new Error('Track contains no frames (empty stts table)')
  }

  // Cumulative start tick per frame. Kept as integer ticks, not seconds, so
  // the mapping never accumulates floating-point drift across long clips.
  const frameTicks = new Float64Array(frameCount)
  const framesPerDelta = new Map<number, number>()
  let index = 0
  let tick = 0
  for (const entry of entries) {
    framesPerDelta.set(entry.delta, (framesPerDelta.get(entry.delta) ?? 0) + entry.count)
    for (let i = 0; i < entry.count; i++) {
      frameTicks[index] = tick
      tick += entry.delta
      index++
    }
  }
  const durationTicks = tick

  // Modal delta, ties broken toward the smaller delta for determinism.
  let modalDelta = 0
  let modalFrames = -1
  for (const [delta, frames] of framesPerDelta) {
    if (frames > modalFrames || (frames === modalFrames && delta < modalDelta)) {
      modalDelta = delta
      modalFrames = frames
    }
  }

  const offModalFrames = frameCount - modalFrames
  return {
    timescale,
    frameCount,
    nominalFps: reduceRational(timescale, modalDelta),
    durationTicks,
    durationSeconds: durationTicks / timescale,
    frameTicks,
    jitter: {
      modalDelta,
      offModalFrames,
      offModalFraction: offModalFrames / frameCount,
      distinctDeltas: framesPerDelta.size,
      isVariable: framesPerDelta.size > 1,
    },
  }
}

/** Exact presentation time of frame `index`, in seconds. */
export function frameTimeSeconds(timebase: Timebase, index: number): number {
  if (index < 0 || index >= timebase.frameCount) {
    throw new RangeError(
      `Frame ${index} out of range (0..${timebase.frameCount - 1})`,
    )
  }
  return timebase.frameTicks[index]! / timebase.timescale
}

/**
 * Index of the frame displayed at `seconds` -- the last frame whose start time
 * is <= the requested time. Binary search over the exact tick table, so it
 * stays correct despite variable frame timing.
 */
export function frameIndexAtTime(timebase: Timebase, seconds: number): number {
  const targetTick = seconds * timebase.timescale
  if (targetTick <= 0) return 0
  let low = 0
  let high = timebase.frameCount - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (timebase.frameTicks[mid]! <= targetTick) low = mid
    else high = mid - 1
  }
  return low
}

/** Reads the video track's timescale and `stts` table out of an MP4 buffer. */
export function parseTimebase(data: ArrayBuffer): Timebase {
  const file = createFile()
  // mp4box identifies where a buffer sits in the stream via this property.
  const buffer = data as ArrayBuffer & { fileStart: number }
  buffer.fileStart = 0
  file.appendBuffer(buffer)
  file.flush()

  const moov = file.moov
  if (!moov || moov.traks.length === 0) {
    throw new Error('No MP4 movie header found — is this really an MP4 file?')
  }
  const track =
    moov.traks.find((trak) => trak.mdia?.hdlr?.handler === 'vide') ?? moov.traks[0]!

  const timescale = track.mdia?.mdhd?.timescale
  const stts = track.mdia?.minf?.stbl?.stts
  if (typeof timescale !== 'number' || !stts) {
    throw new Error('MP4 track is missing the mdhd/stts boxes needed for timing')
  }

  const entries: SampleTableEntry[] = stts.sample_counts.map((count, i) => ({
    count,
    delta: stts.sample_deltas[i]!,
  }))
  return buildTimebase(timescale, entries)
}

/** Reads the timebase from a `File`/`Blob`, e.g. one the user just dropped. */
export async function readTimebase(blob: Blob): Promise<Timebase> {
  return parseTimebase(await blob.arrayBuffer())
}
