/**
 * Manual position corrections, layered on top of tracking output rather than
 * mutating it.
 *
 * The brief requires two things that pull in the same direction: a reload
 * must not lose a correction, and it must stay "visually obvious afterward
 * which values are automatic vs. human-touched." Keeping corrections in a
 * separate map (never overwriting the algorithm's own FrameTrack array)
 * gives both for free -- the original detection is always still there to
 * compare against or revert to, and "is this frame corrected" is just "does
 * this frame's index have an entry in the map."
 *
 * Scope note: a correction only ever applies to a frame the tracker already
 * called TRACKED -- it repositions a point that exists, it doesn't invent one
 * for a LOST/OCCLUDED_IN_HOLE frame. That would be relabeling the frame's
 * *state*, which is a deliberately separate, later piece of work (see
 * CLAUDE.md).
 */

import type { Point } from './geometry.ts'
import type { FrameTrack } from './tracking.ts'

export interface PositionCorrection {
  readonly centroid: Point
  /** Null if the user corrected the centroid but left the nose as detected. */
  readonly nose: Point | null
}

export type Corrections = ReadonlyMap<number, PositionCorrection>

/** A track frame with manual corrections merged in, and which one it is. */
export interface EffectiveFrame extends FrameTrack {
  readonly isCorrected: boolean
}

/** Merges corrections onto tracks, keeping both arrays in frame-index order. */
export function applyCorrections(
  tracks: readonly FrameTrack[],
  corrections: Corrections,
): EffectiveFrame[] {
  return tracks.map((track) => {
    const correction = corrections.get(track.frameIndex)
    if (!correction) return { ...track, isCorrected: false }
    return {
      ...track,
      centroid: correction.centroid,
      nose: correction.nose ?? correction.centroid,
      isCorrected: true,
    }
  })
}
