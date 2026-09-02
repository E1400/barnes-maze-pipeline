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
  /** Radius of an individual hole, in pixels. Proposed by detection. */
  readonly holeRadius: number
  /** How this layout was produced, so the UI can say so. */
  readonly source: 'detected' | 'manual' | 'template'
}

export const DEFAULT_HOLE_COUNT = 20

export const DEFAULT_HOLE_RADIUS = 12

export function createRoi(
  center: Point,
  platformRadius: number,
  ring: RingSpec,
  options: { holeRadius?: number; source?: RoiDefinition['source'] } = {},
): RoiDefinition {
  return {
    center,
    platformRadius,
    ring,
    holes: generateHoleRing(ring),
    nudgedHoles: [],
    targetHole: null,
    platformDiameterCm: null,
    holeRadius: options.holeRadius ?? DEFAULT_HOLE_RADIUS,
    source: options.source ?? 'manual',
  }
}

/**
 * Moves the whole maze -- centre, ring and every hole together.
 *
 * Dragging the centre has to take the ring with it. Moving a centre that
 * leaves the holes behind is not a useful operation on a maze.
 */
export function translateRoi(roi: RoiDefinition, dx: number, dy: number): RoiDefinition {
  return {
    ...roi,
    center: { x: roi.center.x + dx, y: roi.center.y + dy },
    ring: { ...roi.ring, center: { x: roi.center.x + dx, y: roi.center.y + dy } },
    holes: roi.holes.map((h) => ({ x: h.x + dx, y: h.y + dy })),
  }
}

/**
 * Stretches or compresses the ring about the centre.
 *
 * Hole positions are scaled radially rather than regenerated, so hand
 * corrections keep their relative offsets instead of being thrown away by a
 * resize.
 */
export function scaleRing(roi: RoiDefinition, newRingRadius: number): RoiDefinition {
  if (!(newRingRadius > 0) || !(roi.ring.ringRadius > 0)) return roi
  const factor = newRingRadius / roi.ring.ringRadius
  return {
    ...roi,
    ring: { ...roi.ring, ringRadius: newRingRadius },
    holes: roi.holes.map((h) => ({
      x: roi.center.x + (h.x - roi.center.x) * factor,
      y: roi.center.y + (h.y - roi.center.y) * factor,
    })),
  }
}

/** Rotates the whole ring about the centre, preserving hand corrections. */
export function rotateRing(roi: RoiDefinition, deltaRadians: number): RoiDefinition {
  const cos = Math.cos(deltaRadians)
  const sin = Math.sin(deltaRadians)
  return {
    ...roi,
    ring: { ...roi.ring, rotation: roi.ring.rotation + deltaRadians },
    holes: roi.holes.map((h) => {
      const dx = h.x - roi.center.x
      const dy = h.y - roi.center.y
      return {
        x: roi.center.x + dx * cos - dy * sin,
        y: roi.center.y + dx * sin + dy * cos,
      }
    }),
  }
}

/** Resizes the platform boundary without touching the holes. */
export function setPlatformRadius(roi: RoiDefinition, radius: number): RoiDefinition {
  return radius > 0 ? { ...roi, platformRadius: radius } : roi
}

export function setHoleRadius(roi: RoiDefinition, radius: number): RoiDefinition {
  return radius > 0 ? { ...roi, holeRadius: radius } : roi
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
