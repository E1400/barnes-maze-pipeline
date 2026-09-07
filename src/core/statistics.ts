/**
 * Cohort-comparison statistics: a two-group non-parametric test, computed
 * entirely client-side so a facility can compare a control and treatment
 * cohort without exporting to R, SPSS, or Prism first.
 *
 * Mann-Whitney U, not a t-test: Barnes maze cohorts are typically small
 * (a handful of animals per group) and latency/error measures are rarely
 * normally distributed, so a rank-based test that makes no distributional
 * assumption is the more defensible default here.
 */

export interface DescriptiveStats {
  readonly n: number
  readonly mean: number
  readonly median: number
  readonly min: number
  readonly max: number
}

export function describe(values: readonly number[]): DescriptiveStats {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = n === 0 ? NaN : sorted.reduce((a, b) => a + b, 0) / n
  const mid = Math.floor(n / 2)
  const median = n === 0 ? NaN : n % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
  return { n, mean, median, min: n === 0 ? NaN : sorted[0]!, max: n === 0 ? NaN : sorted[n - 1]! }
}

/**
 * Standard normal CDF via Abramowitz & Stegun 7.1.26, accurate to ~1e-7 --
 * a well-known, closed-form approximation, not a from-scratch derivation.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

export interface MannWhitneyResult {
  readonly groupA: DescriptiveStats
  readonly groupB: DescriptiveStats
  /** The smaller of U-for-A and U-for-B, the conventional U statistic. */
  readonly u: number
  /** Normal approximation z-score. Null when either group is empty. */
  readonly z: number | null
  /** Two-tailed p-value from the normal approximation. Null when either group is empty. */
  readonly pValue: number | null
  /**
   * The normal approximation is the standard treatment but weakens below
   * about 8 per group -- flagged here so the UI can say so rather than
   * present a small-sample p-value with the same confidence as a large one.
   */
  readonly smallSample: boolean
}

/**
 * Ranks combined values ascending, averaging ranks across ties (the
 * standard tie-handling for Mann-Whitney, not an approximation of it).
 */
function averageRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const ranks = new Array<number>(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j++
    const averageRank = (i + j) / 2 + 1 // ranks are 1-indexed
    for (let k = i; k <= j; k++) ranks[order[k]!.index] = averageRank
    i = j + 1
  }
  return ranks
}

export function mannWhitneyU(a: readonly number[], b: readonly number[]): MannWhitneyResult {
  const groupA = describe(a)
  const groupB = describe(b)
  const n1 = a.length
  const n2 = b.length

  if (n1 === 0 || n2 === 0) {
    return { groupA, groupB, u: NaN, z: null, pValue: null, smallSample: true }
  }

  const ranks = averageRanks([...a, ...b])
  const rankSumA = ranks.slice(0, n1).reduce((sum, r) => sum + r, 0)
  const u1 = rankSumA - (n1 * (n1 + 1)) / 2
  const u2 = n1 * n2 - u1
  const u = Math.min(u1, u2)

  const meanU = (n1 * n2) / 2
  const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12)
  // Continuity correction: moves the statistic half a step toward the mean
  // before standardizing, the conventional correction for treating a
  // discrete rank statistic with a continuous normal approximation.
  const z = stdU === 0 ? null : (u - meanU + (u < meanU ? 0.5 : -0.5)) / stdU
  const pValue = z === null ? null : 2 * (1 - normalCdf(Math.abs(z)))

  return { groupA, groupB, u, z, pValue, smallSample: n1 < 8 || n2 < 8 }
}
