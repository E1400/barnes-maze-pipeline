/**
 * Reorders items that arrive out of sequence back into strict ascending
 * order, without holding more than a bounded window.
 *
 * Exists for one reason: WebCodecs' VideoDecoder emits decoded frames in
 * *display* order, but this app's frame indices are decode/storage order (the
 * same order `stts` describes, which is what timebase.ts and every scrubber
 * position in the app are built on -- see AI_NOTES for why that's the right
 * convention here). Measured on all three sample clips, the maximum
 * decode-vs-display displacement is 8 frames; `windowSize` should stay well
 * above that so a frame is never evicted before its predecessor arrives.
 */

export class ReorderBuffer<T> {
  private readonly windowSize: number
  private readonly pending = new Map<number, T>()
  private nextExpected = 0

  constructor(windowSize: number) {
    if (windowSize < 1) throw new Error(`windowSize must be at least 1, got ${windowSize}`)
    this.windowSize = windowSize
  }

  /**
   * Adds an out-of-order item and returns every item now ready to emit, in
   * ascending sequence order. Usually empty or one item; can be several when
   * a gap that was blocking emission just got filled.
   */
  push(sequence: number, item: T): T[] {
    if (sequence < this.nextExpected) {
      throw new Error(
        `Sequence ${sequence} already passed (expected >= ${this.nextExpected}) -- duplicate or out-of-window arrival`,
      )
    }
    if (this.pending.has(sequence)) {
      throw new Error(`Sequence ${sequence} pushed twice`)
    }
    this.pending.set(sequence, item)

    const ready: T[] = []
    while (this.pending.has(this.nextExpected)) {
      ready.push(this.pending.get(this.nextExpected)!)
      this.pending.delete(this.nextExpected)
      this.nextExpected++
    }

    // If the buffer is holding more out-of-order items than the configured
    // window allows, something arrived further out of sequence than expected
    // -- surfacing that loudly beats silently reordering wrong.
    if (this.pending.size > this.windowSize) {
      throw new Error(
        `Reorder buffer exceeded its window (${this.windowSize}): ${this.pending.size} items pending ` +
          `ahead of sequence ${this.nextExpected}. The stream is more out-of-order than expected.`,
      )
    }
    return ready
  }

  /** Call once the input is exhausted: flushes any remaining items in order. */
  flush(): T[] {
    const remaining = [...this.pending.keys()].sort((a, b) => a - b)
    const out = remaining.map((seq) => this.pending.get(seq)!)
    this.pending.clear()
    if (remaining.length > 0) this.nextExpected = remaining[remaining.length - 1]! + 1
    return out
  }
}
