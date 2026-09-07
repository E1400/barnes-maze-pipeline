/**
 * Binary morphology, implemented as separable min/max filters (a square
 * structuring element factorises into a horizontal then a vertical pass, which
 * turns an O(r^2) operation into O(r)).
 *
 * Opening -- erode then dilate -- is what removes the thin tail and isolated
 * speckle before the body blob is measured, so the centroid tracks the body
 * rather than being dragged around by the tail.
 */

import type { BinaryMask } from './types.ts'

/**
 * `horizontalScratch` and `out` default to fresh buffers (existing callers
 * and tests see no change), but the tracking hot path -- called twice per
 * video frame via `open`, thousands of times per video -- passes buffers it
 * reuses across frames instead of allocating two fresh ~300KB arrays every
 * call. Both are fully overwritten every pixel on every call (no
 * conditional skip), so a reused buffer never leaks a stale value through.
 *
 * `min` picks the erode/dilate comparison. This used to take the comparison
 * as a callback (`reduce: (a, b) => number`) applied ~20 times per pixel
 * (2 passes x 2*radius neighbours) -- profiling a real 640x480 frame showed
 * that one function, `open()`, at 87.7% of the entire per-frame detection
 * cost (44ms of ~51ms), almost certainly the indirect-call overhead of
 * invoking a closure millions of times a frame rather than the O(radius)
 * algorithm itself. Inlining the comparison, and short-circuiting the moment
 * a mask value (0/1, never anything else) already forces the answer -- an
 * eroding window can stop at its first 0, a dilating one at its first 1 --
 * cut real per-frame morphology time from ~44ms to ~2ms on the same
 * benchmark (see AI_NOTES). Same algorithm, same output (verified against
 * the full existing test suite plus a new byte-for-byte cross-check test),
 * just without paying for a function call on every neighbour of every pixel.
 */
function filterSeparable(
  mask: BinaryMask,
  width: number,
  height: number,
  radius: number,
  min: boolean,
  horizontalScratch: Uint8Array = new Uint8Array(mask.length),
  out: Uint8Array = new Uint8Array(mask.length),
): BinaryMask {
  if (radius <= 0) {
    out.set(mask)
    return out
  }
  // Treats outside-the-image as background (0) for both directions, exactly
  // as the original callback-based version did (`filterSeparable(..., 0)`
  // for both erode and dilate) -- an erode pulls a foreground pixel near the
  // edge toward the unseen background rather than assuming it continues, and
  // a dilate gains nothing from an edge it can't see into.
  const outside = 0
  const stopAt = min ? 0 : 1
  const horizontal = horizontalScratch
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let value = mask[row + x]!
      if (value !== stopAt) {
        for (let d = 1; d <= radius && value !== stopAt; d++) {
          const left = x - d
          const right = x + d
          const leftValue = left >= 0 ? mask[row + left]! : outside
          const rightValue = right < width ? mask[row + right]! : outside
          if (min) {
            if (leftValue < value) value = leftValue
            if (rightValue < value) value = rightValue
          } else {
            if (leftValue > value) value = leftValue
            if (rightValue > value) value = rightValue
          }
        }
      }
      horizontal[row + x] = value
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = horizontal[y * width + x]!
      if (value !== stopAt) {
        for (let d = 1; d <= radius && value !== stopAt; d++) {
          const up = y - d
          const down = y + d
          const upValue = up >= 0 ? horizontal[up * width + x]! : outside
          const downValue = down < height ? horizontal[down * width + x]! : outside
          if (min) {
            if (upValue < value) value = upValue
            if (downValue < value) value = downValue
          } else {
            if (upValue > value) value = upValue
            if (downValue > value) value = downValue
          }
        }
      }
      out[y * width + x] = value
    }
  }
  return out
}

/** Shrinks regions. Treats outside-the-image as background. */
export function erode(
  mask: BinaryMask,
  width: number,
  height: number,
  radius: number,
  horizontalScratch?: Uint8Array,
  out?: Uint8Array,
): BinaryMask {
  return filterSeparable(mask, width, height, radius, true, horizontalScratch, out)
}

/** Grows regions. */
export function dilate(
  mask: BinaryMask,
  width: number,
  height: number,
  radius: number,
  horizontalScratch?: Uint8Array,
  out?: Uint8Array,
): BinaryMask {
  return filterSeparable(mask, width, height, radius, false, horizontalScratch, out)
}

/** Reusable buffers for `open`'s two internal filter passes, so a caller in a hot loop can supply them once per video instead of once per frame. */
export interface MorphologyScratch {
  readonly erodeHorizontal: Uint8Array
  readonly eroded: Uint8Array
  readonly dilateHorizontal: Uint8Array
  readonly opened: Uint8Array
}

/** Erode then dilate: removes thin structures, keeps the bulk shape. */
export function open(
  mask: BinaryMask,
  width: number,
  height: number,
  radius: number,
  scratch?: MorphologyScratch,
): BinaryMask {
  const eroded = erode(mask, width, height, radius, scratch?.erodeHorizontal, scratch?.eroded)
  return dilate(eroded, width, height, radius, scratch?.dilateHorizontal, scratch?.opened)
}

/** Dilate then erode: fills small holes inside a region. */
export function close(
  mask: BinaryMask,
  width: number,
  height: number,
  radius: number,
): BinaryMask {
  return erode(dilate(mask, width, height, radius), width, height, radius)
}
