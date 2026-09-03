/**
 * Search-strategy classification: spatial (direct to target), serial (works
 * the ring hole-by-hole in order), or random (neither) -- the three-way
 * distinction standard in the Barnes-maze literature (see CLAUDE.md's
 * domain facts, and Illouz et al. 2020).
 *
 * Rule-based, not learned, on purpose: it has to work on one trial with no
 * training data, and every step of the decision has to be inspectable and
 * overridable, per the brief's explicit warning that this readout "is often
 * scored inconsistently by eye." The thresholds below are this project's
 * own first-cut heuristic, not values taken from a specific paper -- they
 * are ordinary parameters (`SearchStrategyParams`), not buried constants,
 * for exactly that reason: there is no single published cutoff to defer to.
 *
 * Classification runs up to a *cutoff frame*: the moment the target was
 * first reached, or -- when it never was -- the last tracked frame of the
 * clip, so a trial that never finds the target still gets scored on the
 * search it actually performed rather than being left unclassified.
 */

import type { EffectiveFrame } from './corrections.ts'
import { angleFrom, distance, normalizeAngle } from './geometry.ts'
import type { EffectiveInvestigation } from './investigationEdits.ts'
import type { RoiDefinition } from './roi.ts'

export type SearchStrategyLabel = 'spatial' | 'serial' | 'random'

export interface SearchStrategyParams {
  /** Minimum straight-line-distance / path-length ratio to call the path direct. */
  readonly directnessThreshold: number
  /** Non-target holes investigated before the cutoff still allowed for "spatial". */
  readonly maxErrorsForSpatial: number
  /** Minimum fraction of hole-to-hole transitions continuing the same angular direction to call the order "serial". */
  readonly serialOrderThreshold: number
}

export const DEFAULT_SEARCH_STRATEGY_PARAMS: SearchStrategyParams = {
  directnessThreshold: 0.7,
  maxErrorsForSpatial: 1,
  serialOrderThreshold: 0.7,
}

export interface SearchStrategyResult {
  readonly label: SearchStrategyLabel
  readonly reasoning: string
  /** Whether the cutoff was "reached the target" or "trial ended without it". */
  readonly targetReached: boolean
  readonly cutoffFrame: number
  /** Straight-line distance / actual path length, up to the cutoff. Null if the path has no length. */
  readonly directness: number | null
  /** Fraction of consecutive investigated-hole transitions sharing one angular direction. Null if fewer than 3 holes were investigated. */
  readonly holeOrderScore: number | null
  readonly errorsBeforeCutoff: number
  readonly centerCrossings: number
}

function pathLength(frames: readonly EffectiveFrame[]): number {
  let total = 0
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]!
    const curr = frames[i]!
    if (curr.frameIndex !== prev.frameIndex + 1) continue
    if (prev.state !== 'TRACKED' || curr.state !== 'TRACKED') continue
    total += distance(prev.centroid!, curr.centroid!)
  }
  return total
}

/** How many times the path crosses near the platform centre -- the literature's classic random-search signature. */
function countCenterCrossings(frames: readonly EffectiveFrame[], roi: RoiDefinition): number {
  const centerRadius = roi.platformRadius * 0.2
  let crossings = 0
  let inside = false
  for (const frame of frames) {
    if (frame.state !== 'TRACKED' || !frame.centroid) continue
    const nowInside = distance(frame.centroid, roi.center) <= centerRadius
    if (nowInside && !inside) crossings++
    inside = nowInside
  }
  return crossings
}

/** Fraction of consecutive hole-to-hole angular steps that continue in the same direction (all-clockwise or all-counterclockwise). Null when there's not enough of a sequence to judge. */
function holeOrderScore(holeSequence: readonly number[], roi: RoiDefinition): number | null {
  if (holeSequence.length < 3) return null
  const angles = holeSequence.map((i) => angleFrom(roi.center, roi.holes[i]!))
  const steps: number[] = []
  for (let i = 1; i < angles.length; i++) {
    const delta = normalizeAngle(angles[i]! - angles[i - 1]!)
    // Signed shortest step, in (-pi, pi].
    steps.push(delta > Math.PI ? delta - 2 * Math.PI : delta)
  }
  const positive = steps.filter((s) => s > 0).length
  const negative = steps.filter((s) => s < 0).length
  return Math.max(positive, negative) / steps.length
}

export function classifySearchStrategy(
  frames: readonly EffectiveFrame[],
  roi: RoiDefinition,
  investigations: readonly EffectiveInvestigation[],
  params: SearchStrategyParams = DEFAULT_SEARCH_STRATEGY_PARAMS,
): SearchStrategyResult | null {
  const firstTracked = frames.find((f) => f.state === 'TRACKED' && f.centroid)
  if (!firstTracked || roi.targetHole === null) return null

  const sorted = [...investigations].sort((a, b) => a.startFrame - b.startFrame)
  const targetHit = sorted.find((e) => e.isTarget) ?? null
  const targetReached = targetHit !== null
  const cutoffFrame = targetReached ? targetHit!.startFrame : frames.at(-1)!.frameIndex

  const inRange = frames.filter((f) => f.frameIndex <= cutoffFrame)
  const investigationsInRange = sorted.filter((e) => e.startFrame <= cutoffFrame)
  const errorsBeforeCutoff = investigationsInRange.filter((e) => !e.isTarget).length

  const endPoint = targetReached
    ? roi.holes[roi.targetHole]!
    : (inRange.findLast((f) => f.state === 'TRACKED' && f.centroid)?.centroid ?? firstTracked.centroid!)
  const straightDistance = distance(firstTracked.centroid!, endPoint)
  const traveled = pathLength(inRange)
  const directness = traveled > 0 ? straightDistance / traveled : null

  const holeSequence = investigationsInRange.map((e) => e.holeIndex)
  const orderScore = holeOrderScore(holeSequence, roi)
  const centerCrossings = countCenterCrossings(inRange, roi)

  const endLabel = targetReached ? 'the target' : 'where the trial ended'

  if (directness !== null && directness >= params.directnessThreshold && errorsBeforeCutoff <= params.maxErrorsForSpatial) {
    return {
      label: 'spatial',
      reasoning: `Direct path to ${endLabel}: ${(directness * 100).toFixed(0)}% straight-line efficiency with ${errorsBeforeCutoff} other hole${errorsBeforeCutoff === 1 ? '' : 's'} investigated first.`,
      targetReached,
      cutoffFrame,
      directness,
      holeOrderScore: orderScore,
      errorsBeforeCutoff,
      centerCrossings,
    }
  }

  if (orderScore !== null && orderScore >= params.serialOrderThreshold) {
    return {
      label: 'serial',
      reasoning: `Investigated ${holeSequence.length} holes in ring order (${(orderScore * 100).toFixed(0)}% of transitions continuing one direction) before ${endLabel}.`,
      targetReached,
      cutoffFrame,
      directness,
      holeOrderScore: orderScore,
      errorsBeforeCutoff,
      centerCrossings,
    }
  }

  return {
    label: 'random',
    reasoning: `Neither direct nor ordered: ${directness === null ? 'no measurable path' : `${(directness * 100).toFixed(0)}% path efficiency`}, ${holeSequence.length} hole${holeSequence.length === 1 ? '' : 's'} investigated with no consistent order, crossing the centre ${centerCrossings} time${centerCrossings === 1 ? '' : 's'} before ${endLabel}.`,
    targetReached,
    cutoffFrame,
    directness,
    holeOrderScore: orderScore,
    errorsBeforeCutoff,
    centerCrossings,
  }
}
