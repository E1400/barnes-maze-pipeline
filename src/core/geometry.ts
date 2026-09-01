/**
 * ROI geometry: the platform circle, the ring of holes, and the pixel->cm
 * scale.
 *
 * The design constraint that drives this module: a facility processing 60
 * videos cannot click 20 holes per video. So the ring is *generated* from
 * three clicks -- platform center, platform edge, and any one hole -- and the
 * generated holes are then individually adjustable. Everything here is pure
 * so the generation and nudging rules can be tested without a canvas.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export interface RingSpec {
  readonly center: Point
  /** Distance from center to the hole centers, in pixels. */
  readonly ringRadius: number
  /** Angle of hole 0, in radians, measured from the +x axis. */
  readonly rotation: number
  readonly holeCount: number
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Angle from `center` to `point`, in radians.
 *
 * Note the screen convention: y grows downward, so increasing angle sweeps
 * clockwise as displayed. Hole 0 is wherever the user clicked, and hole
 * indices increase clockwise from there.
 */
export function angleFrom(center: Point, point: Point): number {
  return Math.atan2(point.y - center.y, point.x - center.x)
}

/** Normalizes an angle to [0, 2pi). */
export function normalizeAngle(radians: number): number {
  const twoPi = Math.PI * 2
  return ((radians % twoPi) + twoPi) % twoPi
}

/**
 * Evenly spaced hole centers around the ring. This is the step that turns
 * three clicks into twenty holes.
 */
export function generateHoleRing(spec: RingSpec): Point[] {
  if (spec.holeCount < 1) {
    throw new Error(`Hole count must be at least 1, got ${spec.holeCount}`)
  }
  if (!(spec.ringRadius > 0)) {
    throw new Error(`Ring radius must be positive, got ${spec.ringRadius}`)
  }
  const step = (Math.PI * 2) / spec.holeCount
  const holes: Point[] = []
  for (let i = 0; i < spec.holeCount; i++) {
    const angle = spec.rotation + i * step
    holes.push({
      x: spec.center.x + spec.ringRadius * Math.cos(angle),
      y: spec.center.y + spec.ringRadius * Math.sin(angle),
    })
  }
  return holes
}

/**
 * Derives the ring from the three clicks the user actually makes.
 * `edgePoint` sets the platform radius; `holePoint` sets both the ring radius
 * and the rotation, so hole 0 lands exactly where the user clicked.
 */
export function ringFromClicks(
  center: Point,
  edgePoint: Point,
  holePoint: Point,
  holeCount: number,
): { platformRadius: number; ring: RingSpec; holes: Point[] } {
  const platformRadius = distance(center, edgePoint)
  const ring: RingSpec = {
    center,
    ringRadius: distance(center, holePoint),
    rotation: angleFrom(center, holePoint),
    holeCount,
  }
  return { platformRadius, ring, holes: generateHoleRing(ring) }
}

/** Index of the hole nearest a point, or -1 when there are no holes. */
export function nearestHoleIndex(holes: readonly Point[], point: Point): number {
  let best = -1
  let bestDistance = Infinity
  for (let i = 0; i < holes.length; i++) {
    const d = distance(holes[i]!, point)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return best
}

/**
 * Pixels per centimetre, from the physical platform diameter the user types in.
 *
 * Path length in pixels is not publishable, and pixel scale varies with camera
 * height between rigs, so this has to come from a real measurement rather than
 * a constant.
 */
export function pixelsPerCm(platformRadiusPx: number, platformDiameterCm: number): number {
  if (!(platformRadiusPx > 0)) {
    throw new Error(`Platform radius must be positive, got ${platformRadiusPx}`)
  }
  if (!(platformDiameterCm > 0)) {
    throw new Error(`Platform diameter must be positive, got ${platformDiameterCm}`)
  }
  return (platformRadiusPx * 2) / platformDiameterCm
}

export function pxToCm(px: number, pixelsPerCmScale: number): number {
  return px / pixelsPerCmScale
}

/** True when the point lies inside the platform circle. */
export function isInsidePlatform(
  point: Point,
  center: Point,
  platformRadius: number,
): boolean {
  return distance(center, point) <= platformRadius
}
