/**
 * The region-of-interest definition for one video: the platform, the ring of
 * holes, which hole is the escape target, and the pixel->cm scale.
 *
 * Holes are stored materialized rather than recomputed from the ring spec,
 * because the user can nudge individual holes and those adjustments must
 * survive. `nudgedHoles` records which ones were moved by hand -- the same
 * auto-vs-human provenance the brief requires of the tracking data, applied
 * here so a reviewer can see which holes the tool placed and which a person
 * corrected.
 */

import { generateHoleRing, pixelsPerCm, type Point, type RingSpec } from './geometry.ts'

export interface RoiDefinition {
  readonly center: Point
  /** Platform boundary, in pixels. Masks out hardware outside the platform. */
  readonly platformRadius: number
  readonly ring: RingSpec
  readonly holes: readonly Point[]
  /** Indices of holes a human moved, so the UI can mark them. */
  readonly nudgedHoles: readonly number[]
  /** Index into `holes`, or null until the user marks the escape hole. */
  readonly targetHole: number | null
  /** Physical platform diameter in cm, typed in by the user. */
  readonly platformDiameterCm: number | null
}

export const DEFAULT_HOLE_COUNT = 20

export function createRoi(
  center: Point,
  platformRadius: number,
  ring: RingSpec,
): RoiDefinition {
  return {
    center,
    platformRadius,
    ring,
    holes: generateHoleRing(ring),
    nudgedHoles: [],
    targetHole: null,
    platformDiameterCm: null,
  }
}

/** Moves one hole and records that a human, not the generator, placed it. */
export function nudgeHole(roi: RoiDefinition, index: number, to: Point): RoiDefinition {
  if (index < 0 || index >= roi.holes.length) {
    throw new RangeError(`No hole at index ${index}`)
  }
  const holes = roi.holes.slice()
  holes[index] = to
  const nudged = roi.nudgedHoles.includes(index)
    ? roi.nudgedHoles
    : [...roi.nudgedHoles, index].sort((a, b) => a - b)
  return { ...roi, holes, nudgedHoles: nudged }
}

/**
 * Regenerates the ring from a changed spec, discarding hand nudges.
 *
 * Destructive on purpose, and the UI says so before calling it: silently
 * keeping stale nudged positions against a moved ring would produce a ROI that
 * looks generated but isn't.
 */
export function regenerateRing(roi: RoiDefinition, ring: RingSpec): RoiDefinition {
  return { ...roi, ring, holes: generateHoleRing(ring), nudgedHoles: [] }
}

export function setTargetHole(roi: RoiDefinition, index: number | null): RoiDefinition {
  if (index !== null && (index < 0 || index >= roi.holes.length)) {
    throw new RangeError(`No hole at index ${index}`)
  }
  return { ...roi, targetHole: index }
}

export function setPlatformDiameterCm(
  roi: RoiDefinition,
  diameterCm: number | null,
): RoiDefinition {
  return { ...roi, platformDiameterCm: diameterCm }
}

/** Pixels per cm, or null while the platform diameter is unset. */
export function roiPixelsPerCm(roi: RoiDefinition): number | null {
  if (roi.platformDiameterCm === null || roi.platformDiameterCm <= 0) return null
  return pixelsPerCm(roi.platformRadius, roi.platformDiameterCm)
}

/**
 * What still has to happen before this ROI can drive tracking. Drives the
 * checklist in the editor rather than a disabled button with no explanation.
 */
export function roiCompleteness(roi: RoiDefinition | null): {
  hasRing: boolean
  hasTarget: boolean
  hasScale: boolean
  isComplete: boolean
} {
  const hasRing = roi !== null && roi.holes.length > 0
  const hasTarget = roi?.targetHole !== null && roi?.targetHole !== undefined
  const hasScale = roi !== null && roiPixelsPerCm(roi) !== null
  return { hasRing, hasTarget, hasScale, isComplete: hasRing && hasTarget && hasScale }
}
