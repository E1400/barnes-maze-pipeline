/**
 * Hole investigation events: detecting when the animal engaged with a hole,
 * independent of the tracker's own TRACKED/LOST/OCCLUDED_IN_HOLE/IN_ESCAPE_BOX
 * state machine.
 *
 * This is a genuinely different question from tracking state. OCCLUDED_IN_HOLE
 * only fires when the whole tracked blob vanishes -- correct for a real
 * disappearance, but a nose-poke (head dips toward a hole, body stays fully
 * visible) never makes the blob disappear at all, so it can never produce that
 * state. Detecting a nose-poke needs its own signal: nose-to-hole proximity
 * sustained over a few frames, which is exactly what this module adds.
 *
 * Deliberately no single hard-coded threshold. There is no universally agreed
 * definition of "investigating" a hole in the literature, so both knobs
 * (how close, how long) are named parameters a caller can adjust and show,
 * never buried constants.
 */

import type { Point } from './geometry.ts'
import type { EffectiveFrame } from './corrections.ts'

export interface InvestigationParams {
  /** Nose-to-hole distance, in hole-radius multiples, counted as "at the hole." */
  readonly proximityRadiusFactor: number
  /** Minimum consecutive frames at a hole before it counts, not a passing brush. */
  readonly minFrames: number
}

export const DEFAULT_INVESTIGATION_PARAMS: InvestigationParams = {
  proximityRadiusFactor: 1.5,
  minFrames: 3,
}

export interface HoleInvestigation {
  readonly holeIndex: number
  readonly isTarget: boolean
  readonly startFrame: number
  readonly endFrame: number
  /**
   * How this investigation was detected. `occlusion` is the stronger, rarer
   * signal -- the animal's whole body vanished near this hole, an event the
   * tracker itself already flagged (OCCLUDED_IN_HOLE) -- and is always
   * counted regardless of `minFrames`, since a real occlusion is definitionally
   * a real event, never a passing brush. `proximity` is the nose-detected
   * kind this module adds, gated by both threshold parameters.
   */
  readonly kind: 'proximity' | 'occlusion'
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

interface HoleRef {
  readonly holes: readonly Point[]
  readonly holeRadius: number
  readonly targetHole: number | null
}

/** The nearest hole to a point, if within the given radius. */
function nearestHoleWithin(point: Point, roi: HoleRef, radius: number): number | null {
  let bestIndex: number | null = null
  let bestDistance = radius
  for (let i = 0; i < roi.holes.length; i++) {
    const d = distance(point, roi.holes[i]!)
    if (d <= bestDistance) {
      bestDistance = d
      bestIndex = i
    }
  }
  return bestIndex
}

/**
 * Detects every hole investigation across a track: nose-proximity runs meeting
 * both threshold parameters, plus every OCCLUDED_IN_HOLE run the tracker
 * already identified (unconditionally -- see `HoleInvestigation.kind`).
 * Frames belonging to an occlusion-based investigation are excluded from
 * proximity detection, so the same span is never reported twice.
 */
export function detectInvestigations(
  frames: readonly EffectiveFrame[],
  roi: HoleRef,
  params: InvestigationParams = DEFAULT_INVESTIGATION_PARAMS,
): HoleInvestigation[] {
  const events: HoleInvestigation[] = []
  const proximityRadius = roi.holeRadius * params.proximityRadiusFactor

  // Occlusion-based investigations first, straight from the tracker's own
  // classification -- always real, never subject to the proximity threshold.
  let occlusionStart: number | null = null
  let occlusionHole: number | null = null
  const flushOcclusion = (endFrame: number) => {
    if (occlusionStart !== null && occlusionHole !== null) {
      events.push({
        holeIndex: occlusionHole,
        isTarget: occlusionHole === roi.targetHole,
        startFrame: occlusionStart,
        endFrame,
        kind: 'occlusion',
      })
    }
    occlusionStart = null
    occlusionHole = null
  }
  for (const frame of frames) {
    if (frame.state === 'OCCLUDED_IN_HOLE' && frame.holeIndex !== null) {
      if (occlusionHole !== frame.holeIndex) {
        flushOcclusion(frame.frameIndex - 1)
        occlusionStart = frame.frameIndex
        occlusionHole = frame.holeIndex
      }
    } else {
      flushOcclusion(frame.frameIndex - 1)
    }
  }
  flushOcclusion(frames.at(-1)?.frameIndex ?? -1)

  const occludedFrames = new Set<number>()
  for (const event of events) {
    for (let f = event.startFrame; f <= event.endFrame; f++) occludedFrames.add(f)
  }

  // Proximity-based investigations: consecutive-frame runs at the same hole.
  let runHole: number | null = null
  let runStart: number | null = null
  let runEnd: number | null = null
  const flushRun = () => {
    if (runHole !== null && runStart !== null && runEnd !== null) {
      if (runEnd - runStart + 1 >= params.minFrames) {
        events.push({
          holeIndex: runHole,
          isTarget: runHole === roi.targetHole,
          startFrame: runStart,
          endFrame: runEnd,
          kind: 'proximity',
        })
      }
    }
    runHole = null
    runStart = null
    runEnd = null
  }
  for (const frame of frames) {
    if (occludedFrames.has(frame.frameIndex)) {
      flushRun()
      continue
    }
    const nose = frame.state === 'TRACKED' ? frame.nose : null
    const hole = nose ? nearestHoleWithin(nose, roi, proximityRadius) : null
    if (hole !== null && hole === runHole) {
      runEnd = frame.frameIndex
    } else {
      flushRun()
      if (hole !== null) {
        runHole = hole
        runStart = frame.frameIndex
        runEnd = frame.frameIndex
      }
    }
  }
  flushRun()

  return events.sort((a, b) => a.startFrame - b.startFrame)
}
