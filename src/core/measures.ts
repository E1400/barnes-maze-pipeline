/**
 * Per-trial measures: the numbers that actually go in the paper, computed
 * from a track plus its detected hole investigations.
 *
 * See CLAUDE.md's "Domain facts" section for the exact definitions this
 * follows: primary latency is time to *first reach* the target hole, total
 * latency is time to *enter the escape box*; primary/total errors are
 * non-target investigations before vs. across the whole trial.
 *
 * Everything here is pure -- frames, an ROI, a timebase and investigation
 * params in, one measures record out -- so it unit-tests on synthetic data
 * without a browser or a video.
 */

import { angleFrom, normalizeAngle } from './geometry.ts'
import type { EffectiveFrame } from './corrections.ts'
import { DEFAULT_INVESTIGATION_PARAMS, detectInvestigations, type HoleInvestigation, type InvestigationParams } from './events.ts'
import type { RoiDefinition } from './roi.ts'
import { roiPixelsPerCm } from './roi.ts'
import { frameTimeSeconds, type Timebase } from './timebase.ts'

export interface QuadrantTimesSeconds {
  /** The quadrant centered on the target hole. */
  readonly target: number
  /** The quadrant centered 180° opposite the target. */
  readonly opposite: number
  /** 90° clockwise from target (screen convention: y grows downward). */
  readonly adjacentClockwise: number
  readonly adjacentCounterClockwise: number
}

export interface TrialMeasures {
  /** Seconds from trial start to the first target-hole investigation. Null if the target was never investigated. */
  readonly primaryLatencySeconds: number | null
  /** Seconds from trial start to the first IN_ESCAPE_BOX frame. Null if the animal never escaped. */
  readonly totalLatencySeconds: number | null
  /** Non-target investigations before the primary latency (or, if the target was never found, across the whole trial). */
  readonly primaryErrors: number
  /** Non-target investigations across the whole trial. */
  readonly totalErrors: number
  /** Null until the platform diameter is calibrated -- pixels are not publishable. */
  readonly pathLengthCm: number | null
  /** Path length over the elapsed time of the segments that contributed to it, excluding gaps. */
  readonly averageSpeedCmPerSecond: number | null
  /** Null until a target hole is set -- quadrants are oriented around it. */
  readonly quadrantTimeSeconds: QuadrantTimesSeconds | null
  readonly investigations: readonly HoleInvestigation[]
}

function frameDurationSeconds(timebase: Timebase, frameIndex: number): number {
  const start = frameTimeSeconds(timebase, frameIndex)
  if (frameIndex + 1 < timebase.frameCount) {
    return frameTimeSeconds(timebase, frameIndex + 1) - start
  }
  return Math.max(0, timebase.durationSeconds - start)
}

type Quadrant = keyof QuadrantTimesSeconds

function quadrantFor(pointAngle: number, targetAngle: number): Quadrant {
  const diff = normalizeAngle(pointAngle - targetAngle)
  const quarter = Math.PI / 2
  if (diff < quarter / 2 || diff >= Math.PI * 2 - quarter / 2) return 'target'
  if (diff < quarter + quarter / 2) return 'adjacentClockwise'
  if (diff < Math.PI * 2 - quarter - quarter / 2) return 'opposite'
  return 'adjacentCounterClockwise'
}

function computeQuadrantTimes(
  frames: readonly EffectiveFrame[],
  roi: RoiDefinition,
  timebase: Timebase,
): QuadrantTimesSeconds | null {
  if (roi.targetHole === null) return null
  const targetAngle = angleFrom(roi.center, roi.holes[roi.targetHole]!)
  const totals: QuadrantTimesSeconds = {
    target: 0,
    opposite: 0,
    adjacentClockwise: 0,
    adjacentCounterClockwise: 0,
  }
  const add = (quadrant: Quadrant, seconds: number) => {
    ;(totals as Record<Quadrant, number>)[quadrant] += seconds
  }

  for (const frame of frames) {
    const dt = frameDurationSeconds(timebase, frame.frameIndex)
    // TRACKED: the real centroid. OCCLUDED_IN_HOLE / IN_ESCAPE_BOX: the
    // animal's position is still known -- it's at a specific hole -- so that
    // known point drives the quadrant, not a guess. LOST is genuinely
    // unknown and contributes to no quadrant, per the project's rule that an
    // honest gap beats a beautiful wrong answer.
    let point = frame.centroid
    if (!point && (frame.state === 'OCCLUDED_IN_HOLE' || frame.state === 'IN_ESCAPE_BOX')) {
      const holeIndex = frame.state === 'IN_ESCAPE_BOX' ? roi.targetHole : frame.holeIndex
      point = holeIndex !== null ? roi.holes[holeIndex]! : null
    }
    if (!point) continue
    add(quadrantFor(angleFrom(roi.center, point), targetAngle), dt)
  }
  return totals
}

function computePathAndSpeed(
  frames: readonly EffectiveFrame[],
  roi: RoiDefinition,
  timebase: Timebase,
): { pathLengthCm: number | null; averageSpeedCmPerSecond: number | null } {
  const pxPerCm = roiPixelsPerCm(roi)
  if (pxPerCm === null) return { pathLengthCm: null, averageSpeedCmPerSecond: null }

  let pathLengthPx = 0
  let elapsedSeconds = 0
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]!
    const curr = frames[i]!
    if (curr.frameIndex !== prev.frameIndex + 1) continue // a gap: not a real segment
    if (prev.state !== 'TRACKED' || curr.state !== 'TRACKED') continue
    pathLengthPx += Math.hypot(curr.centroid!.x - prev.centroid!.x, curr.centroid!.y - prev.centroid!.y)
    elapsedSeconds += frameDurationSeconds(timebase, prev.frameIndex)
  }
  const pathLengthCm = pathLengthPx / pxPerCm
  return {
    pathLengthCm,
    averageSpeedCmPerSecond: elapsedSeconds > 0 ? pathLengthCm / elapsedSeconds : null,
  }
}

export function computeTrialMeasures(
  frames: readonly EffectiveFrame[],
  roi: RoiDefinition,
  timebase: Timebase,
  investigationParams: InvestigationParams = DEFAULT_INVESTIGATION_PARAMS,
): TrialMeasures {
  const investigations = detectInvestigations(frames, roi, investigationParams)
  const trialStart = frames.length > 0 ? frameTimeSeconds(timebase, 0) : 0

  const firstTarget = investigations.find((e) => e.isTarget) ?? null
  const primaryLatencySeconds =
    firstTarget !== null ? frameTimeSeconds(timebase, firstTarget.startFrame) - trialStart : null

  const firstEscapeFrame = frames.find((f) => f.state === 'IN_ESCAPE_BOX') ?? null
  const totalLatencySeconds =
    firstEscapeFrame !== null ? frameTimeSeconds(timebase, firstEscapeFrame.frameIndex) - trialStart : null

  const nonTargetInvestigations = investigations.filter((e) => !e.isTarget)
  const primaryErrors =
    firstTarget !== null
      ? nonTargetInvestigations.filter((e) => e.startFrame < firstTarget.startFrame).length
      : nonTargetInvestigations.length
  const totalErrors = nonTargetInvestigations.length

  const { pathLengthCm, averageSpeedCmPerSecond } = computePathAndSpeed(frames, roi, timebase)
  const quadrantTimeSeconds = computeQuadrantTimes(frames, roi, timebase)

  return {
    primaryLatencySeconds,
    totalLatencySeconds,
    primaryErrors,
    totalErrors,
    pathLengthCm,
    averageSpeedCmPerSecond,
    quadrantTimeSeconds,
    investigations,
  }
}
