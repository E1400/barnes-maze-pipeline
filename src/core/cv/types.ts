/**
 * Single-channel image types shared by the CV operations.
 *
 * The sample clips are greyscale to begin with (the colour channels carry no
 * information), so everything downstream works on one channel. Frames are
 * plain typed arrays rather than a library image type, which keeps every
 * operation in this directory a pure function that a unit test can construct
 * by hand.
 */

export interface GrayFrame {
  readonly width: number
  readonly height: number
  /** Row-major, one byte per pixel. */
  readonly data: Uint8Array
}

/** Row-major 0/1 mask, same dimensions as the frame it applies to. */
export type BinaryMask = Uint8Array

export function createGray(width: number, height: number, fill = 0): GrayFrame {
  const data = new Uint8Array(width * height)
  if (fill !== 0) data.fill(fill)
  return { width, height, data }
}

export function assertSameSize(a: GrayFrame, b: GrayFrame): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Frame size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    )
  }
}
