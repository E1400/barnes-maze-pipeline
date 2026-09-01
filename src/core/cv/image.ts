/** Basic per-pixel image operations. */

import { assertSameSize, createGray, type BinaryMask, type GrayFrame } from './types.ts'

/**
 * Rec. 601 luma from RGBA. The source clips are greyscale, so this mostly
 * collapses three identical channels, but doing it properly costs nothing and
 * keeps the tool correct on a colour recording.
 */
export function rgbaToGray(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): GrayFrame {
  const expected = width * height * 4
  if (rgba.length < expected) {
    throw new Error(`RGBA buffer too small: ${rgba.length} < ${expected}`)
  }
  const out = new Uint8Array(width * height)
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = (0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!) | 0
  }
  return { width, height, data: out }
}

/** Per-pixel |a - b|. The core of background subtraction. */
export function absDiff(a: GrayFrame, b: GrayFrame): GrayFrame {
  assertSameSize(a, b)
  const out = createGray(a.width, a.height)
  for (let i = 0; i < a.data.length; i++) {
    const d = a.data[i]! - b.data[i]!
    out.data[i] = d < 0 ? -d : d
  }
  return out
}

/**
 * Builds a filled-circle mask. Used for the platform: everything outside it is
 * ignored, which is what rejects the cable and hardware visible beyond the
 * platform edge in test51.
 */
export function circleMask(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
): BinaryMask {
  const mask = new Uint8Array(width * height)
  const r2 = radius * radius
  for (let y = 0; y < height; y++) {
    const dy = y - centerY
    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      if (dx * dx + dy * dy <= r2) mask[y * width + x] = 1
    }
  }
  return mask
}

/** Zeroes every pixel outside the mask. */
export function applyMask(frame: GrayFrame, mask: BinaryMask): GrayFrame {
  if (mask.length !== frame.data.length) {
    throw new Error(`Mask size ${mask.length} does not match frame ${frame.data.length}`)
  }
  const out = createGray(frame.width, frame.height)
  for (let i = 0; i < frame.data.length; i++) {
    out.data[i] = mask[i] ? frame.data[i]! : 0
  }
  return out
}
