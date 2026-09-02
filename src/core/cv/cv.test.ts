import { describe, expect, it } from 'vitest'
import { backgroundSampleIndices, medianBackground } from './background.ts'
import { axisEndpoints, connectedComponents } from './components.ts'
import { DEFAULT_DETECTION_PARAMS, TypeScriptDetector } from './detector.ts'
import { absDiff, applyMask, circleMask, rgbaToGray } from './image.ts'
import { close, dilate, erode, open } from './morphology.ts'
import { binarize, binarizeBelow, otsuThreshold } from './threshold.ts'
import { createGray, type BinaryMask, type GrayFrame } from './types.ts'

/** Draws a filled rectangle of `value` into a frame. */
function rect(frame: GrayFrame, x0: number, y0: number, w: number, h: number, value: number) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) frame.data[y * frame.width + x] = value
  }
}

function maskRect(width: number, height: number, x0: number, y0: number, w: number, h: number) {
  const mask = new Uint8Array(width * height)
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) mask[y * width + x] = 1
  }
  return mask
}

describe('rgbaToGray', () => {
  it('applies Rec. 601 luma weights', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
    const gray = rgbaToGray(rgba, 2, 1)
    expect(gray.data[0]).toBe(76) // 0.299 * 255
    expect(gray.data[1]).toBe(149) // 0.587 * 255
  })

  it('refuses a buffer that is too small rather than reading garbage', () => {
    expect(() => rgbaToGray(new Uint8ClampedArray(4), 10, 10)).toThrow(/too small/i)
  })
})

describe('absDiff', () => {
  it('is symmetric and never wraps around', () => {
    const a = createGray(2, 1)
    const b = createGray(2, 1)
    a.data.set([10, 250])
    b.data.set([250, 10])
    expect(Array.from(absDiff(a, b).data)).toEqual([240, 240])
    expect(Array.from(absDiff(b, a).data)).toEqual([240, 240])
  })

  it('rejects mismatched sizes', () => {
    expect(() => absDiff(createGray(2, 2), createGray(3, 3))).toThrow(/mismatch/i)
  })
})

describe('circleMask / applyMask', () => {
  it('keeps only what is inside the platform', () => {
    const mask = circleMask(21, 21, 10, 10, 5)
    expect(mask[10 * 21 + 10]).toBe(1)
    expect(mask[10 * 21 + 15]).toBe(1) // exactly on the radius
    expect(mask[10 * 21 + 16]).toBe(0)
    expect(mask[0]).toBe(0) // a corner: the hardware outside the platform

    const frame = createGray(21, 21, 200)
    const masked = applyMask(frame, mask)
    expect(masked.data[10 * 21 + 10]).toBe(200)
    expect(masked.data[0]).toBe(0)
  })
})

describe('medianBackground', () => {
  it('removes a moving object while keeping the static scene', () => {
    // Static scene with a dark "hole"; a dark "mouse" moves across it.
    const frames: GrayFrame[] = []
    for (let i = 0; i < 9; i++) {
      const frame = createGray(20, 10, 200)
      rect(frame, 2, 2, 3, 3, 20) // the hole: always in the same place
      rect(frame, 6 + i, 5, 2, 2, 10) // the mouse: moves every frame
      frames.push(frame)
    }
    const background = medianBackground(frames)

    // The hole survives -- it is part of the scene.
    expect(background.data[3 * 20 + 3]).toBe(20)
    // The mouse does not: every position it occupied is background again.
    for (let i = 0; i < 9; i++) {
      expect(background.data[5 * 20 + (6 + i)]).toBe(200)
    }
  })

  it('is not dragged by a lingering object the way a mean would be', () => {
    // 3 of 9 frames have a dark blob in one spot. The mean would be ~137;
    // the median is the true background.
    const frames: GrayFrame[] = []
    for (let i = 0; i < 9; i++) {
      const frame = createGray(4, 4, 200)
      if (i < 3) rect(frame, 1, 1, 2, 2, 10)
      frames.push(frame)
    }
    expect(medianBackground(frames).data[1 * 4 + 1]).toBe(200)
  })

  it('rejects an empty frame list', () => {
    expect(() => medianBackground([])).toThrow(/at least one frame/i)
  })
})

describe('backgroundSampleIndices', () => {
  it('spreads samples across the whole clip, including both ends', () => {
    const indices = backgroundSampleIndices(741, 5)
    expect(indices[0]).toBe(0)
    expect(indices.at(-1)).toBe(740)
    expect(indices).toHaveLength(5)
  })

  it('never asks for more frames than the clip has', () => {
    expect(backgroundSampleIndices(3, 50)).toEqual([0, 1, 2])
  })
})

describe('otsuThreshold', () => {
  it('separates a clearly bimodal image into the right two classes', () => {
    const frame = createGray(10, 10, 10)
    rect(frame, 0, 0, 10, 5, 200)
    const threshold = otsuThreshold(frame)

    // Otsu returns the *lower edge* of the split and binarize uses a strict
    // '>', so with only 10s and 200s present, 10 is the correct answer -- any
    // value in [10, 199] partitions identically. Assert the partition rather
    // than a particular number in that range.
    expect(threshold).toBeGreaterThanOrEqual(10)
    expect(threshold).toBeLessThan(200)
    const binary = binarize(frame, threshold)
    expect(binary[0]).toBe(1) // bright half is foreground
    expect(binary[9 * 10]).toBe(0) // dark half is background
    expect(binary.reduce((a, b) => a + b, 0)).toBe(50)
  })

  it('ignores pixels outside the mask', () => {
    // Bright block sits outside the mask, so the masked view is uniform.
    const frame = createGray(10, 10, 10)
    rect(frame, 0, 0, 10, 5, 200)
    const mask = maskRect(10, 10, 0, 5, 10, 5)
    expect(otsuThreshold(frame, mask)).toBeLessThan(10)
  })
})

describe('binarize', () => {
  it('marks only pixels above the threshold, and nothing outside the mask', () => {
    const frame = createGray(4, 1)
    frame.data.set([5, 25, 100, 250])
    expect(Array.from(binarize(frame, 30))).toEqual([0, 0, 1, 1])
    const mask = new Uint8Array([1, 1, 0, 0])
    expect(Array.from(binarize(frame, 30, mask))).toEqual([0, 0, 0, 0])
  })
})

describe('binarizeBelow', () => {
  it('includes pixels exactly at the threshold', () => {
    // Otsu returns the lower edge of the split, so on a two-value image the
    // threshold IS the dark value. A strict '<' here finds nothing at all --
    // the bug that made hole detection return zero holes.
    const frame = createGray(4, 1)
    frame.data.set([55, 55, 190, 190])
    const threshold = otsuThreshold(frame)
    expect(threshold).toBe(55)
    expect(Array.from(binarizeBelow(frame, threshold))).toEqual([1, 1, 0, 0])
  })

  it('is the exact complement of binarize', () => {
    const frame = createGray(6, 1)
    frame.data.set([0, 30, 55, 90, 190, 255])
    const above = binarize(frame, 55)
    const below = binarizeBelow(frame, 55)
    for (let i = 0; i < frame.data.length; i++) {
      expect(above[i]! + below[i]!).toBe(1)
    }
  })

  it('never marks pixels outside the mask', () => {
    const frame = createGray(4, 1)
    frame.data.set([10, 10, 10, 10])
    expect(Array.from(binarizeBelow(frame, 50, new Uint8Array([1, 0, 1, 0])))).toEqual([1, 0, 1, 0])
  })
})

describe('morphology', () => {
  const width = 11
  const height = 11

  it('erode removes a one-pixel-wide line, dilate grows a dot', () => {
    const line: BinaryMask = new Uint8Array(width * height)
    for (let x = 0; x < width; x++) line[5 * width + x] = 1
    expect(erode(line, width, height, 1).every((v) => v === 0)).toBe(true)

    const dot = new Uint8Array(width * height)
    dot[5 * width + 5] = 1
    const grown = dilate(dot, width, height, 1)
    expect(grown.reduce((a, b) => a + b, 0)).toBe(9) // 3x3 square
  })

  it('open strips a thin tail but keeps the body', () => {
    // A 5x5 body with a 1px tail -- the shape this whole step exists for.
    const mask = new Uint8Array(width * height)
    for (let y = 3; y < 8; y++) for (let x = 1; x < 6; x++) mask[y * width + x] = 1
    for (let x = 6; x < 11; x++) mask[5 * width + x] = 1

    const opened = open(mask, width, height, 1)
    expect(opened[5 * width + 3]).toBe(1) // body survives
    expect(opened[5 * width + 9]).toBe(0) // tail is gone
  })

  it('close fills a small gap inside a region', () => {
    const mask = new Uint8Array(width * height)
    for (let y = 3; y < 8; y++) for (let x = 3; x < 8; x++) mask[y * width + x] = 1
    mask[5 * width + 5] = 0 // pinhole
    expect(close(mask, width, height, 1)[5 * width + 5]).toBe(1)
  })

  it('radius 0 is a no-op', () => {
    const mask = new Uint8Array([1, 0, 1, 0])
    expect(Array.from(erode(mask, 2, 2, 0))).toEqual([1, 0, 1, 0])
  })
})

describe('connectedComponents', () => {
  it('separates two blobs and measures each', () => {
    const width = 20
    const height = 10
    const mask = new Uint8Array(width * height)
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) mask[y * width + x] = 1 // 3x3
    for (let y = 5; y < 9; y++) for (let x = 10; x < 14; x++) mask[y * width + x] = 1 // 4x4

    const { components } = connectedComponents(mask, width, height)
    expect(components).toHaveLength(2)
    // Sorted largest first.
    expect(components[0]!.area).toBe(16)
    expect(components[1]!.area).toBe(9)
    expect(components[1]!.centroidX).toBeCloseTo(2, 9)
    expect(components[1]!.centroidY).toBeCloseTo(2, 9)
    expect(components[0]!.minX).toBe(10)
    expect(components[0]!.maxY).toBe(8)
  })

  it('treats diagonal contact as connected (8-connectivity)', () => {
    const mask = new Uint8Array(4 * 4)
    mask[0] = 1 // (0,0)
    mask[1 * 4 + 1] = 1 // (1,1), touching only at a corner
    expect(connectedComponents(mask, 4, 4).components).toHaveLength(1)
  })

  it('merges a U shape into one component rather than three', () => {
    // Catches a union-find that never resolves equivalences.
    const width = 7
    const height = 5
    const mask = new Uint8Array(width * height)
    for (let y = 0; y < 4; y++) {
      mask[y * width + 1] = 1
      mask[y * width + 5] = 1
    }
    for (let x = 1; x <= 5; x++) mask[3 * width + x] = 1
    expect(connectedComponents(mask, width, height).components).toHaveLength(1)
  })

  it('finds the principal axis of an elongated blob', () => {
    const width = 30
    const height = 30
    const mask = new Uint8Array(width * height)
    // Horizontal bar: 20 wide, 4 tall.
    for (let y = 13; y < 17; y++) for (let x = 5; x < 25; x++) mask[y * width + x] = 1

    const labelled = connectedComponents(mask, width, height)
    const blob = labelled.components[0]!
    expect(Math.abs(Math.sin(blob.orientation))).toBeLessThan(0.01) // axis is horizontal
    expect(blob.majorSigma).toBeGreaterThan(blob.minorSigma * 3)

    const [a, b] = axisEndpoints(labelled, blob)
    const xs = [a.x, b.x].sort((p, q) => p - q)
    expect(xs[0]).toBe(5)
    expect(xs[1]).toBe(24)
  })

  it('returns nothing for an empty mask', () => {
    expect(connectedComponents(new Uint8Array(16), 4, 4).components).toEqual([])
  })
})

describe('TypeScriptDetector', () => {
  const detector = new TypeScriptDetector()
  const width = 60
  const height = 60

  /** A static scene with dark "holes", plus an optional dark "mouse". */
  function scene(mouse?: { x: number; y: number; w: number; h: number }) {
    const frame = createGray(width, height, 180)
    rect(frame, 5, 5, 4, 4, 30) // hole
    rect(frame, 50, 50, 4, 4, 30) // hole
    if (mouse) rect(frame, mouse.x, mouse.y, mouse.w, mouse.h, 25)
    return frame
  }

  const background = scene()

  it('finds the animal and not the holes', () => {
    // The point of background subtraction: holes are dark too, but static.
    const frame = scene({ x: 25, y: 20, w: 10, h: 6 })
    const detection = detector.detect(frame, background, undefined, {
      ...DEFAULT_DETECTION_PARAMS,
      minAreaPx: 20,
    })
    expect(detection.found).toBe(true)
    expect(detection.centroid!.x).toBeCloseTo(29.5, 1)
    expect(detection.centroid!.y).toBeCloseTo(22.5, 1)
    expect(detection.area).toBeGreaterThan(20)
    expect(detection.candidateCount).toBe(1)
  })

  it('reports not-found rather than inventing a position', () => {
    // An empty frame is a real answer: the animal is not visible.
    const detection = detector.detect(background, background, undefined, {
      ...DEFAULT_DETECTION_PARAMS,
      minAreaPx: 20,
    })
    expect(detection.found).toBe(false)
    expect(detection.centroid).toBeNull()
    expect(detection.area).toBe(0)
  })

  it('reports the threshold it actually used', () => {
    const frame = scene({ x: 25, y: 20, w: 10, h: 6 })
    const fixed = detector.detect(frame, background, undefined, {
      ...DEFAULT_DETECTION_PARAMS,
      thresholdMode: 'fixed',
      fixedThreshold: 42,
      minAreaPx: 20,
    })
    expect(fixed.threshold).toBe(42)

    const auto = detector.detect(frame, background, undefined, {
      ...DEFAULT_DETECTION_PARAMS,
      minAreaPx: 20,
    })
    expect(auto.threshold).toBeGreaterThanOrEqual(DEFAULT_DETECTION_PARAMS.minThreshold)
  })

  it('ignores movement outside the platform mask', () => {
    // Something moving beyond the platform edge -- the cable in test51 -- must
    // not be tracked as the animal.
    const frame = scene()
    rect(frame, 0, 28, 4, 4, 20)
    const mask = circleMask(width, height, 30, 30, 20)
    const detection = detector.detect(frame, background, mask, {
      ...DEFAULT_DETECTION_PARAMS,
      minAreaPx: 10,
    })
    expect(detection.found).toBe(false)
  })

  it('rejects blobs outside the plausible size range', () => {
    const frame = scene({ x: 25, y: 20, w: 10, h: 6 })
    const tooBig = detector.detect(frame, background, undefined, {
      ...DEFAULT_DETECTION_PARAMS,
      minAreaPx: 20,
      maxAreaPx: 30,
    })
    expect(tooBig.found).toBe(false)
  })

  it('flags an ambiguous frame with more than one candidate', () => {
    const frame = scene({ x: 25, y: 20, w: 10, h: 6 })
    rect(frame, 40, 15, 8, 6, 25) // a second moving thing
    const detection = detector.detect(frame, background, undefined, {
      ...DEFAULT_DETECTION_PARAMS,
      minAreaPx: 20,
    })
    expect(detection.candidateCount).toBe(2)
    expect(detection.runnerUpArea).toBeGreaterThan(0)
  })

  it('gives both ends of the body so the tracker can pick the nose', () => {
    const frame = scene({ x: 20, y: 30, w: 16, h: 4 })
    const detection = detector.detect(frame, background, undefined, {
      ...DEFAULT_DETECTION_PARAMS,
      minAreaPx: 20,
      openRadius: 1,
    })
    expect(detection.axisEnds).not.toBeNull()
    const [a, b] = detection.axisEnds!
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(10)
    expect(detection.orientation).not.toBeNull()
  })
})
