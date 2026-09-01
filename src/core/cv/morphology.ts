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

type Reducer = (a: number, b: number) => number

const MIN: Reducer = (a, b) => (a < b ? a : b)
const MAX: Reducer = (a, b) => (a > b ? a : b)

function filterSeparable(
  mask: BinaryMask,
  width: number,
  height: number,
  radius: number,
  reduce: Reducer,
  outside: number,
): BinaryMask {
  if (radius <= 0) return mask.slice()
  const horizontal = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let value = mask[row + x]!
      for (let d = 1; d <= radius; d++) {
        const left = x - d
        const right = x + d
        value = reduce(value, left >= 0 ? mask[row + left]! : outside)
        value = reduce(value, right < width ? mask[row + right]! : outside)
      }
      horizontal[row + x] = value
    }
  }

  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = horizontal[y * width + x]!
      for (let d = 1; d <= radius; d++) {
        const up = y - d
        const down = y + d
        value = reduce(value, up >= 0 ? horizontal[up * width + x]! : outside)
        value = reduce(value, down < height ? horizontal[down * width + x]! : outside)
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
): BinaryMask {
  return filterSeparable(mask, width, height, radius, MIN, 0)
}

/** Grows regions. */
export function dilate(
  mask: BinaryMask,
  width: number,
  height: number,
  radius: number,
): BinaryMask {
  return filterSeparable(mask, width, height, radius, MAX, 0)
}

/** Erode then dilate: removes thin structures, keeps the bulk shape. */
export function open(
  mask: BinaryMask,
  width: number,
  height: number,
  radius: number,
): BinaryMask {
  return dilate(erode(mask, width, height, radius), width, height, radius)
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
