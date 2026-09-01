/**
 * Per-frame animal detection, behind an interface.
 *
 * The interface exists so a second backend (OpenCV.js) can be dropped in and
 * run on identical frames with identical parameters, making "is OpenCV better
 * here?" an experiment rather than an argument. `TypeScriptDetector` is the
 * default: pure functions from ./image, ./threshold, ./morphology and
 * ./components, all unit-testable without a browser.
 */

import { axisEndpoints, connectedComponents, type ComponentStats } from './components.ts'
import { absDiff, applyMask } from './image.ts'
import { open } from './morphology.ts'
import { binarize, otsuThreshold } from './threshold.ts'
import type { BinaryMask, GrayFrame } from './types.ts'

export interface DetectionParams {
  /**
   * 'otsu' recomputes the threshold per frame from the difference image;
   * 'fixed' uses `fixedThreshold`. Whichever is used, the value actually
   * applied is reported back in the detection.
   */
  readonly thresholdMode: 'otsu' | 'fixed'
  readonly fixedThreshold: number
  /**
   * Otsu can produce a very low threshold on a frame with no animal in it
   * (it will happily split sensor noise into two classes), so its result is
   * clamped to at least this value.
   */
  readonly minThreshold: number
  /** Opening radius, in pixels. Strips the tail and speckle. */
  readonly openRadius: number
  /** Blobs outside this area range are not the animal. */
  readonly minAreaPx: number
  readonly maxAreaPx: number
}

export const DEFAULT_DETECTION_PARAMS: DetectionParams = {
  thresholdMode: 'otsu',
  fixedThreshold: 30,
  minThreshold: 18,
  openRadius: 2,
  minAreaPx: 60,
  maxAreaPx: 8000,
}

export interface Detection {
  /** False when nothing in the frame met the criteria -- a real answer, not an error. */
  readonly found: boolean
  readonly centroid: { x: number; y: number } | null
  readonly area: number
  /** Principal axis angle, radians. Null when nothing was found. */
  readonly orientation: number | null
  /**
   * The two ends of the body along its principal axis. Which one is the nose
   * depends on the direction of travel, which a single frame cannot know, so
   * that decision belongs to the tracker rather than here.
   */
  readonly axisEnds: [{ x: number; y: number }, { x: number; y: number }] | null
  /** The threshold actually applied, so the UI can show it. */
  readonly threshold: number
  /** Blobs that passed the area filter. >1 means the frame was ambiguous. */
  readonly candidateCount: number
  /** Area of the second-largest candidate, for judging ambiguity. */
  readonly runnerUpArea: number
}

export interface Detector {
  readonly name: string
  detect(
    frame: GrayFrame,
    background: GrayFrame,
    mask: BinaryMask | undefined,
    params: DetectionParams,
  ): Detection
}

const NOT_FOUND = (threshold: number, candidateCount = 0, runnerUpArea = 0): Detection => ({
  found: false,
  centroid: null,
  area: 0,
  orientation: null,
  axisEnds: null,
  threshold,
  candidateCount,
  runnerUpArea,
})

export class TypeScriptDetector implements Detector {
  readonly name = 'typescript'

  detect(
    frame: GrayFrame,
    background: GrayFrame,
    mask: BinaryMask | undefined,
    params: DetectionParams,
  ): Detection {
    // 1. What changed since the static background. The mouse moves; the
    //    platform, the holes and the cable do not.
    const difference = mask ? applyMask(absDiff(frame, background), mask) : absDiff(frame, background)

    // 2. How much change counts. Reported either way.
    const threshold =
      params.thresholdMode === 'fixed'
        ? params.fixedThreshold
        : Math.max(params.minThreshold, otsuThreshold(difference, mask))

    // 3. Binary foreground, opened to drop the tail and speckle.
    const binary = binarize(difference, threshold, mask)
    const cleaned = open(binary, frame.width, frame.height, params.openRadius)

    // 4. Largest blob within the plausible size range.
    const labelled = connectedComponents(cleaned, frame.width, frame.height)
    const candidates = labelled.components.filter(
      (c: ComponentStats) => c.area >= params.minAreaPx && c.area <= params.maxAreaPx,
    )
    if (candidates.length === 0) return NOT_FOUND(threshold, 0, 0)

    const best = candidates[0]!
    return {
      found: true,
      centroid: { x: best.centroidX, y: best.centroidY },
      area: best.area,
      orientation: best.orientation,
      axisEnds: axisEndpoints(labelled, best),
      threshold,
      candidateCount: candidates.length,
      runnerUpArea: candidates[1]?.area ?? 0,
    }
  }
}
