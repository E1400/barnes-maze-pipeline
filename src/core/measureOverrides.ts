/**
 * Manual overrides on computed per-trial measures.
 *
 * Every number on the trial-stats cards is a computed value, and a computed
 * value can be wrong -- the CV missed something a reviewer watched happen
 * with their own eyes. This is the same overlay-not-mutation shape as
 * `corrections.ts` and `investigationEdits.ts`: the computed measures are
 * never touched, only overridden for display, so the computed value is
 * always still there to compare against or revert to.
 */

import type { QuadrantTimesSeconds } from './measures.ts'
import type { SearchStrategyLabel } from './searchStrategy.ts'

export interface MeasureOverrides {
  readonly primaryLatencySeconds?: number
  readonly totalLatencySeconds?: number
  readonly primaryErrors?: number
  readonly totalErrors?: number
  readonly pathLengthCm?: number
  readonly averageSpeedCmPerSecond?: number
  readonly quadrantTargetSeconds?: number
  readonly quadrantOppositeSeconds?: number
  readonly quadrantAdjacentClockwiseSeconds?: number
  readonly quadrantAdjacentCounterClockwiseSeconds?: number
  readonly searchStrategy?: SearchStrategyLabel
}

export const EMPTY_MEASURE_OVERRIDES: MeasureOverrides = {}

export function setOverride<K extends keyof MeasureOverrides>(
  overrides: MeasureOverrides,
  key: K,
  value: MeasureOverrides[K],
): MeasureOverrides {
  return { ...overrides, [key]: value }
}

export function clearOverride(overrides: MeasureOverrides, key: keyof MeasureOverrides): MeasureOverrides {
  const next = { ...overrides }
  delete next[key]
  return next
}

/**
 * Merges overrides onto computed measures for anywhere that needs the
 * "as displayed" numbers as plain values -- export, primarily -- rather
 * than re-deriving the override-vs-computed logic each card already has.
 * Generic over the investigations shape for the same reason
 * `computeTrialMeasuresFromInvestigations` is: a caller with an edited
 * (id/source-tagged) list shouldn't have it narrowed away.
 */
export function applyMeasureOverrides<
  M extends {
    readonly primaryLatencySeconds: number | null
    readonly totalLatencySeconds: number | null
    readonly primaryErrors: number
    readonly totalErrors: number
    readonly pathLengthCm: number | null
    readonly averageSpeedCmPerSecond: number | null
    readonly quadrantTimeSeconds: QuadrantTimesSeconds | null
  },
>(measures: M, overrides: MeasureOverrides): M {
  return {
    ...measures,
    primaryLatencySeconds: overrides.primaryLatencySeconds ?? measures.primaryLatencySeconds,
    totalLatencySeconds: overrides.totalLatencySeconds ?? measures.totalLatencySeconds,
    primaryErrors: overrides.primaryErrors ?? measures.primaryErrors,
    totalErrors: overrides.totalErrors ?? measures.totalErrors,
    pathLengthCm: overrides.pathLengthCm ?? measures.pathLengthCm,
    averageSpeedCmPerSecond: overrides.averageSpeedCmPerSecond ?? measures.averageSpeedCmPerSecond,
    quadrantTimeSeconds: measures.quadrantTimeSeconds && {
      target: overrides.quadrantTargetSeconds ?? measures.quadrantTimeSeconds.target,
      opposite: overrides.quadrantOppositeSeconds ?? measures.quadrantTimeSeconds.opposite,
      adjacentClockwise: overrides.quadrantAdjacentClockwiseSeconds ?? measures.quadrantTimeSeconds.adjacentClockwise,
      adjacentCounterClockwise:
        overrides.quadrantAdjacentCounterClockwiseSeconds ?? measures.quadrantTimeSeconds.adjacentCounterClockwise,
    },
  }
}
