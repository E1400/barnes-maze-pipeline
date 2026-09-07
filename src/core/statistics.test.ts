import { describe, expect, it } from 'vitest'
import { describe as describeStats, mannWhitneyU } from './statistics.ts'

describe('describe (descriptive stats)', () => {
  it('computes mean, median, min, max', () => {
    const stats = describeStats([1, 2, 3, 4])
    expect(stats.n).toBe(4)
    expect(stats.mean).toBe(2.5)
    expect(stats.median).toBe(2.5)
    expect(stats.min).toBe(1)
    expect(stats.max).toBe(4)
  })

  it('handles an odd count and an empty array', () => {
    expect(describeStats([1, 2, 3]).median).toBe(2)
    const empty = describeStats([])
    expect(empty.n).toBe(0)
    expect(Number.isNaN(empty.mean)).toBe(true)
  })
})

describe('mannWhitneyU', () => {
  it('finds U = 0 for two completely separated groups (hand-computed)', () => {
    const result = mannWhitneyU([1, 2, 3], [4, 5, 6])
    expect(result.u).toBe(0)
    expect(result.groupA.n).toBe(3)
    expect(result.groupB.n).toBe(3)
    // Complete separation with n=3 each is the most extreme possible result,
    // but still not "significant" at a conventional threshold with only 3
    // per group -- exactly why smallSample is flagged rather than hidden.
    expect(result.smallSample).toBe(true)
    expect(result.pValue).not.toBeNull()
  })

  it('finds U at its expected value for two identical groups, with tie handling (hand-computed)', () => {
    // Combined ranks with ties averaged: 1,1 -> 1.5; 2,2 -> 3.5; 3,3 -> 5.5.
    // Rank sum for group A (values 1,2,3) = 1.5+3.5+5.5 = 10.5.
    // U1 = 10.5 - n1(n1+1)/2 = 10.5 - 6 = 4.5 = n1*n2/2 exactly.
    const result = mannWhitneyU([1, 2, 3], [1, 2, 3])
    expect(result.u).toBeCloseTo(4.5, 6)
    expect(result.pValue!).toBeGreaterThan(0.5) // no evidence of a difference
  })

  it('reports null z/p and treats it as a small sample when either group is empty', () => {
    const result = mannWhitneyU([], [1, 2, 3])
    expect(result.z).toBeNull()
    expect(result.pValue).toBeNull()
    expect(result.smallSample).toBe(true)
  })

  it('is not flagged as a small sample once both groups reach 8', () => {
    const eight = [1, 2, 3, 4, 5, 6, 7, 8]
    const otherEight = [9, 10, 11, 12, 13, 14, 15, 16]
    expect(mannWhitneyU(eight, otherEight).smallSample).toBe(false)
  })

  it('gives a low p-value for two clearly, consistently different groups at a larger n', () => {
    const low = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const high = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    const result = mannWhitneyU(low, high)
    expect(result.pValue!).toBeLessThan(0.01)
  })
})
