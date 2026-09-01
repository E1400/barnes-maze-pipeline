/**
 * Thresholding of the background-difference image.
 *
 * "What counts as different enough from the background" has no single right
 * answer, so the threshold is computed automatically *and* reported, and the
 * caller can override it. A buried constant here would be exactly the kind of
 * invisible parameter the brief warns about.
 */

import type { BinaryMask, GrayFrame } from './types.ts'

/**
 * Otsu's method: the threshold that best separates the histogram into two
 * classes by maximising between-class variance. Computed over masked pixels
 * only, so the black area outside the platform cannot drag it down.
 */
export function otsuThreshold(frame: GrayFrame, mask?: BinaryMask): number {
  const histogram = new Float64Array(256)
  let total = 0
  for (let i = 0; i < frame.data.length; i++) {
    if (mask && !mask[i]) continue
    histogram[frame.data[i]!]++
    total++
  }
  if (total === 0) return 0

  let sum = 0
  for (let v = 0; v < 256; v++) sum += v * histogram[v]!

  let sumBackground = 0
  let weightBackground = 0
  let best = 0
  let bestVariance = -1
  for (let v = 0; v < 256; v++) {
    weightBackground += histogram[v]!
    if (weightBackground === 0) continue
    const weightForeground = total - weightBackground
    if (weightForeground === 0) break
    sumBackground += v * histogram[v]!
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const delta = meanBackground - meanForeground
    const variance = weightBackground * weightForeground * delta * delta
    if (variance > bestVariance) {
      bestVariance = variance
      best = v
    }
  }
  return best
}

/**
 * Pixels strictly above `threshold` become 1. Masked-out pixels are always 0.
 *
 * Note the strict comparison: `otsuThreshold` returns the lower edge of the
 * split (the highest intensity still considered background), so `> threshold`
 * is the partition Otsu actually chose.
 */
export function binarize(
  frame: GrayFrame,
  threshold: number,
  mask?: BinaryMask,
): BinaryMask {
  const out = new Uint8Array(frame.data.length)
  for (let i = 0; i < frame.data.length; i++) {
    if (mask && !mask[i]) continue
    out[i] = frame.data[i]! > threshold ? 1 : 0
  }
  return out
}
