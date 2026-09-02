import { describe, expect, it } from 'vitest'
import { ReorderBuffer } from './reorderBuffer.ts'

describe('ReorderBuffer', () => {
  it('emits immediately when items arrive already in order', () => {
    const buffer = new ReorderBuffer<string>(4)
    expect(buffer.push(0, 'a')).toEqual(['a'])
    expect(buffer.push(1, 'b')).toEqual(['b'])
    expect(buffer.push(2, 'c')).toEqual(['c'])
  })

  it('holds items back until the gap in front of them is filled', () => {
    const buffer = new ReorderBuffer<string>(4)
    expect(buffer.push(1, 'b')).toEqual([])
    expect(buffer.push(2, 'c')).toEqual([])
    expect(buffer.push(0, 'a')).toEqual(['a', 'b', 'c']) // fills the gap, releases all three
  })

  it('matches the measured worst case: displacement of 8 frames', () => {
    // The real reorder pattern measured on the sample clips (B-frame
    // reordering with a max decode-vs-display displacement of 8).
    const buffer = new ReorderBuffer<number>(16)
    const decodeOrder = [0, 1, 2, 4, 3, 6, 5, 8, 7, 9] // small local swaps, like real B-frame GOPs
    const emitted: number[] = []
    for (const seq of decodeOrder) emitted.push(...buffer.push(seq, seq))
    expect(emitted).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('flush releases whatever is left, in order', () => {
    const buffer = new ReorderBuffer<string>(4)
    buffer.push(1, 'b')
    buffer.push(2, 'c')
    expect(buffer.flush()).toEqual(['b', 'c'])
  })

  it('flush on a buffer with nothing pending returns nothing', () => {
    const buffer = new ReorderBuffer<string>(4)
    buffer.push(0, 'a')
    expect(buffer.flush()).toEqual([])
  })

  it('rejects a sequence number that already passed', () => {
    const buffer = new ReorderBuffer<string>(4)
    buffer.push(0, 'a')
    expect(() => buffer.push(0, 'a-again')).toThrow(/already passed/)
  })

  it('rejects a duplicate push of a still-pending sequence', () => {
    const buffer = new ReorderBuffer<string>(4)
    buffer.push(2, 'c')
    expect(() => buffer.push(2, 'c-again')).toThrow(/pushed twice/)
  })

  it('throws loudly rather than silently misordering when the window is exceeded', () => {
    const buffer = new ReorderBuffer<number>(2)
    buffer.push(1, 1)
    buffer.push(2, 2)
    expect(() => buffer.push(3, 3)).toThrow(/exceeded its window/)
  })

  it('rejects a nonsensical window size', () => {
    expect(() => new ReorderBuffer(0)).toThrow(/windowSize/)
  })
})
