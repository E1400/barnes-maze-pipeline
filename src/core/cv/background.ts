/**
 * Median-of-frames background model.
 *
 * This is the load-bearing step of the whole tracker. The holes are dark and
 * so is the mouse, so a naive dark-pixel detector finds 21 blobs, not 1. The
 * median over frames spread across the clip keeps whatever is static (the
 * platform, the holes, the shadows, the cable) and discards whatever moves
 * (the mouse), so subtracting it leaves the animal alone.
 *
 * Median rather than mean: a mean is dragged toward the mouse everywhere the
 * mouse lingered, leaving ghost trails that the subtraction then reports as
 * foreground.
 */

import { assertSameSize, createGray, type GrayFrame } from './types.ts'

/** Evenly spaced frame indices to sample for the background model. */
export function backgroundSampleIndices(frameCount: number, sampleCount: number): number[] {
  if (frameCount <= 0) throw new Error('Cannot sample a clip with no frames')
  const count = Math.max(1, Math.min(sampleCount, frameCount))
  if (count === 1) return [0]
  const indices: number[] = []
  for (let i = 0; i < count; i++) {
    indices.push(Math.round((i * (frameCount - 1)) / (count - 1)))
  }
  // Rounding can repeat an index on very short clips.
  return [...new Set(indices)]
}

/**
 * Per-pixel median across the supplied frames.
 *
 * Uses a 256-bin counting sort per pixel, clearing only the bins actually
 * touched, which keeps it linear in the number of frames rather than
 * sorting a small array 300,000 times.
 */
export function medianBackground(frames: readonly GrayFrame[]): GrayFrame {
  if (frames.length === 0) throw new Error('Need at least one frame to build a background')
  const first = frames[0]!
  for (const frame of frames) assertSameSize(first, frame)

  const out = createGray(first.width, first.height)
  const bins = new Uint16Array(256)
  const half = frames.length >> 1
  const pixelCount = out.data.length

  for (let p = 0; p < pixelCount; p++) {
    for (let f = 0; f < frames.length; f++) bins[frames[f]!.data[p]!]++
    let cumulative = 0
    let median = 0
    for (let value = 0; value < 256; value++) {
      cumulative += bins[value]!
      if (cumulative > half) {
        median = value
        break
      }
    }
    out.data[p] = median
    // Clear only the bins this pixel touched.
    for (let f = 0; f < frames.length; f++) bins[frames[f]!.data[p]!] = 0
  }
  return out
}
