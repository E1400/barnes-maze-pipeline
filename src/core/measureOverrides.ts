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
