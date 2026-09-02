/**
 * Proposes the maze geometry from a single frame, so the user reviews and
 * corrects a layout instead of eyeballing one from scratch.
 *
 * Asking someone to click "the centre of the platform" is asking them to
 * estimate, by eye, a point they cannot actually see — there is no marker
 * there. The frame, however, contains everything needed: the platform is a
 * bright disc against a dark surround, and the holes are dark, roughly
 * circular, and evenly spaced around a ring. Finding those and fitting a
 * circle to them locates the centre far more precisely than a human click.
 *
 * The output is a *proposal*. Every value stays editable, and detection
 * reports what it found so the user can judge whether to trust it.
 */

import { connectedComponents, type ComponentStats } from './components.ts'
import { circleMask } from './image.ts'
import { close, open } from './morphology.ts'
import { binarizeBelow, otsuThreshold } from './threshold.ts'
import type { GrayFrame } from './types.ts'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface MazeDetectionParams {
  /** Ignore dark blobs smaller/larger than this when looking for holes. */
  readonly minHoleAreaPx: number
  readonly maxHoleAreaPx: number
  /** Used only when too few holes are found to infer the count from spacing. */
  readonly fallbackHoleCount: number
  /** Despeckle radius applied to the hole mask. */
  readonly holeOpenRadius: number
}

export const DEFAULT_MAZE_PARAMS: MazeDetectionParams = {
  minHoleAreaPx: 12,
  maxHoleAreaPx: 900,
  fallbackHoleCount: 20,
  holeOpenRadius: 1,
}

export interface MazeDetection {
  readonly ok: boolean
  /** Why detection failed, or a note about what was uncertain. */
  readonly note: string
  readonly center: Point
  readonly platformRadius: number
  readonly ringRadius: number
  readonly rotation: number
  readonly holeCount: number
  /** Regular ring, with each hole snapped to a detected one where possible. */
  readonly holes: readonly Point[]
  /** Raw hole detections, before regularisation — shown as diagnostics. */
  readonly detectedHoles: readonly Point[]
  /** Median radius of the detected holes, in pixels. */
  readonly holeRadius: number
  /** How many ring positions had a real detection under them. */
  readonly matchedHoles: number
}

function failure(note: string): MazeDetection {
  return {
    ok: false,
    note,
    center: { x: 0, y: 0 },
    platformRadius: 0,
    ringRadius: 0,
    rotation: 0,
    holeCount: 0,
    holes: [],
    detectedHoles: [],
    holeRadius: 0,
    matchedHoles: 0,
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Kasa least-squares circle fit. Given points on a ring, recovers the centre
 * far more accurately than any single click, because every hole contributes.
 */
export function fitCircle(points: readonly Point[]): { center: Point; radius: number } | null {
  if (points.length < 3) return null
  let sumX = 0
  let sumY = 0
  for (const p of points) {
    sumX += p.x
    sumY += p.y
  }
  const meanX = sumX / points.length
  const meanY = sumY / points.length

  // Solve the normal equations in centred coordinates for numerical stability.
  let suu = 0
  let svv = 0
  let suv = 0
  let suuu = 0
  let svvv = 0
  let suvv = 0
  let svuu = 0
  for (const p of points) {
    const u = p.x - meanX
    const v = p.y - meanY
    suu += u * u
    svv += v * v
    suv += u * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const determinant = 2 * (suu * svv - suv * suv)
  if (Math.abs(determinant) < 1e-9) return null
  const uc = (svv * (suuu + suvv) - suv * (svvv + svuu)) / determinant
  const vc = (suu * (svvv + svuu) - suv * (suuu + suvv)) / determinant
  const center = { x: uc + meanX, y: vc + meanY }
  const radius = median(points.map((p) => Math.hypot(p.x - center.x, p.y - center.y)))
  return { center, radius }
}

/** Circular mean of angles, used to fit the ring's phase. */
function circularMean(angles: number[]): number {
  let sin = 0
  let cos = 0
  for (const a of angles) {
    sin += Math.sin(a)
    cos += Math.cos(a)
  }
  return Math.atan2(sin, cos)
}

/** Finds the bright platform disc: the largest bright connected component. */
function findPlatform(frame: GrayFrame): { center: Point; radius: number } | null {
  const threshold = otsuThreshold(frame)
  const bright = new Uint8Array(frame.data.length)
  for (let i = 0; i < frame.data.length; i++) bright[i] = frame.data[i]! > threshold ? 1 : 0

  // The holes are dark, so they punch gaps in the bright disc. Closing them
  // makes the platform a solid region before it is measured.
  const solid = close(bright, frame.width, frame.height, 6)
  const { components } = connectedComponents(solid, frame.width, frame.height)
  const platform = components[0]
  if (!platform || platform.area < 0.02 * frame.data.length) return null

  // Radius from the bounding box rather than the area: robust to the disc
  // being clipped by a hole-filling imperfection, and to a non-solid interior.
  const radius = (platform.maxX - platform.minX + (platform.maxY - platform.minY)) / 4
  return {
    center: { x: (platform.minX + platform.maxX) / 2, y: (platform.minY + platform.maxY) / 2 },
    radius,
  }
}

/** Dark, roughly circular blobs inside the platform. */
function findHoleCandidates(
  frame: GrayFrame,
  center: Point,
  platformRadius: number,
  params: MazeDetectionParams,
): ComponentStats[] {
  // Stay just inside the rim so the dark surround is not sampled as a hole.
  const inside = circleMask(frame.width, frame.height, center.x, center.y, platformRadius * 0.97)
  const threshold = otsuThreshold(frame, inside)
  const dark = binarizeBelow(frame, threshold, inside)
  const cleaned = open(dark, frame.width, frame.height, params.holeOpenRadius)
  const { components } = connectedComponents(cleaned, frame.width, frame.height)

  return components.filter((c) => {
    if (c.area < params.minHoleAreaPx || c.area > params.maxHoleAreaPx) return false
    // Holes are round: the two axis spreads should be comparable. This is what
    // rejects the animal, which is elongated, and any smear or shadow.
    const elongation = c.majorSigma / Math.max(c.minorSigma, 0.5)
    return elongation < 2.2
  })
}

/** Angles closer together than this are the same hole detected twice. */
const DUPLICATE_ANGLE_RADIANS = 0.04 // ~2.3 degrees; a 48-hole ring still spans 7.5

/**
 * Merges near-identical angles, so one hole detected as two adjacent blobs
 * counts once. Without this, the extra angle forces the ring fit to a larger
 * count -- the bug that reported 21 holes for a real 20-hole maze.
 */
function mergeDuplicateAngles(angles: readonly number[]): number[] {
  const sorted = [...angles].sort((a, b) => a - b)
  const merged: number[] = []
  let group: number[] = []
  for (const angle of sorted) {
    if (group.length === 0 || angle - group.at(-1)! <= DUPLICATE_ANGLE_RADIANS) {
      group.push(angle)
    } else {
      merged.push(circularMean(group))
      group = [angle]
    }
  }
  if (group.length > 0) merged.push(circularMean(group))
  // The first and last groups may wrap onto each other.
  if (
    merged.length > 1 &&
    merged[0]! + Math.PI * 2 - merged.at(-1)! <= DUPLICATE_ANGLE_RADIANS
  ) {
    const first = merged.shift()!
    merged[merged.length - 1] = circularMean([first, merged.at(-1)!])
  }
  return merged
}

/**
 * Best-fit phase for a ring of `count` evenly spaced slots, plus how well the
 * observed angles fit it.
 *
 * The error is scored over *every* angle, not one per slot: a coarse ring must
 * explain all the detections, or it is the wrong ring.
 */
function fitRing(
  angles: readonly number[],
  count: number,
): { rotation: number; rms: number; occupiedSlots: number } {
  const slot = (Math.PI * 2) / count
  // Each angle's offset from its nearest slot, averaged circularly (scaling by
  // `count` maps one slot onto a full turn, so the mean wraps correctly).
  const offsets = angles.map((a) => (a - Math.round(a / slot) * slot) * count)
  const rotation = circularMean(offsets) / count

  const occupied = new Set<number>()
  let sum = 0
  for (const a of angles) {
    const d = a - rotation
    const residual = d - Math.round(d / slot) * slot
    sum += residual * residual
    occupied.add(((Math.round(d / slot) % count) + count) % count)
  }
  return {
    rotation,
    rms: Math.sqrt(sum / Math.max(1, angles.length)),
    occupiedSlots: occupied.size,
  }
}

/**
 * Infers how many holes the ring has.
 *
 * Deriving it from the smallest angular gap is tempting and wrong: one split
 * detection produces a tiny gap and inflates the count. Instead, fit every
 * plausible ring size and take the *smallest* one all detections sit on
 * cleanly. Smallest matters because any multiple of the true count also fits
 * perfectly -- a 20-hole ring is a perfect subset of a 40-hole ring.
 *
 * The occupancy floor stops a tiny ring from winning by having almost no slots
 * to explain: a couple of clumps of angles should not be reported as a 6-hole
 * maze.
 */
export function estimateRing(
  angles: readonly number[],
  fallbackCount: number,
): { holeCount: number; rotation: number } {
  const unique = mergeDuplicateAngles(angles)
  for (let count = 6; count <= 48; count++) {
    const { rotation, rms, occupiedSlots } = fitRing(unique, count)
    const slot = (Math.PI * 2) / count
    const enoughSlotsFilled = occupiedSlots >= Math.max(3, Math.ceil(count * 0.4))
    // Residuals under ~12% of a slot mean the holes really are on this ring.
    if (enoughSlotsFilled && rms < slot * 0.12) return { holeCount: count, rotation }
  }
  return { holeCount: fallbackCount, rotation: fitRing(unique, fallbackCount).rotation }
}

export function detectMaze(
  frame: GrayFrame,
  params: MazeDetectionParams = DEFAULT_MAZE_PARAMS,
): MazeDetection {
  const platform = findPlatform(frame)
  if (!platform) return failure('Could not find a bright platform in this frame.')

  const candidates = findHoleCandidates(frame, platform.center, platform.radius, params)
  if (candidates.length < 3) {
    return {
      ...failure('Found the platform but not enough holes to fit a ring.'),
      ok: false,
      center: platform.center,
      platformRadius: platform.radius,
    }
  }

  // Holes sit near the rim; anything close to the middle is the start cylinder
  // or the animal, not a hole.
  const nearRim = candidates.filter((c) => {
    const d = Math.hypot(c.centroidX - platform.center.x, c.centroidY - platform.center.y)
    return d > platform.radius * 0.45
  })
  const usable = nearRim.length >= 3 ? nearRim : candidates

  // Keep those consistent with a single ring radius.
  const distances = usable.map((c) =>
    Math.hypot(c.centroidX - platform.center.x, c.centroidY - platform.center.y),
  )
  const medianDistance = median(distances)
  const onRing = usable.filter((_c, i) => Math.abs(distances[i]! - medianDistance) < medianDistance * 0.18)
  if (onRing.length < 3) return failure('Hole candidates were not arranged in a ring.')

  const detectedHoles: Point[] = onRing.map((c) => ({ x: c.centroidX, y: c.centroidY }))

  // Refit the centre to the holes themselves -- the ring is a better estimator
  // of the maze centre than the platform outline, which the rim lighting and
  // the escape box can distort.
  const fitted = fitCircle(detectedHoles)
  const center = fitted?.center ?? platform.center
  const ringRadius = fitted?.radius ?? medianDistance

  const angles = detectedHoles.map((h) => Math.atan2(h.y - center.y, h.x - center.x))

  const { holeCount, rotation } = estimateRing(angles, params.fallbackHoleCount)
  const slot = (Math.PI * 2) / holeCount

  // Generate the regular ring, then snap each slot onto a real detection when
  // one is close: regular where the evidence is missing, measured where it is not.
  const snapDistance = ringRadius * slot * 0.45
  const holes: Point[] = []
  let matchedHoles = 0
  for (let i = 0; i < holeCount; i++) {
    const angle = rotation + i * slot
    const ideal = {
      x: center.x + ringRadius * Math.cos(angle),
      y: center.y + ringRadius * Math.sin(angle),
    }
    let best: Point | null = null
    let bestDistance = snapDistance
    for (const detected of detectedHoles) {
      const d = Math.hypot(detected.x - ideal.x, detected.y - ideal.y)
      if (d < bestDistance) {
        bestDistance = d
        best = detected
      }
    }
    if (best) matchedHoles++
    holes.push(best ?? ideal)
  }

  const holeRadius = median(onRing.map((c) => Math.sqrt(c.area / Math.PI)))
  const missing = holeCount - matchedHoles
  return {
    ok: true,
    note:
      missing === 0
        ? `Found all ${holeCount} holes.`
        : `Found ${matchedHoles} of ${holeCount} holes; the rest were placed evenly and may need a nudge.`,
    center,
    platformRadius: platform.radius,
    ringRadius,
    rotation,
    holeCount,
    holes,
    detectedHoles,
    holeRadius: holeRadius > 0 ? holeRadius : ringRadius * 0.08,
    matchedHoles,
  }
}
