/**
 * Per-frame tracking state machine.
 *
 * A vanished blob is ambiguous by itself -- it means either "the tracker
 * lost the animal" or "the animal went into a hole," and those drive
 * opposite downstream measures. This module turns a sequence of per-frame
 * `Detection`s (from cv/detector.ts) into a sequence of classified,
 * positioned frames, deciding which of those two a vanish actually was, and
 * assigning which end of the body is the nose from the direction of travel.
 *
 * Pure and DOM-free: takes plain detections in, returns plain track records
 * out, so the state machine itself is testable without a browser or a video.
 */

import type { Detection } from './cv/detector.ts'
import type { Point } from './geometry.ts'

export type TrackState = 'TRACKED' | 'LOST' | 'OCCLUDED_IN_HOLE' | 'IN_ESCAPE_BOX'

export interface FrameTrack {
  readonly frameIndex: number
  readonly state: TrackState
  /** Body centroid, or null when nothing was seen this frame. */
  readonly centroid: Point | null
  /** Leading point along the direction of travel, or null when not tracked. */
  readonly nose: Point | null
  readonly area: number
  /**
   * Index of the hole this frame is attributed to, for OCCLUDED_IN_HOLE and
   * IN_ESCAPE_BOX states. Null otherwise.
   */
  readonly holeIndex: number | null
}

export interface TrackerParams {
  /**
   * How close (in ring-hole-radius multiples) the last known position must be
   * to a hole for a vanish to be attributed to it, rather than called LOST.
   */
  readonly holeProximityRadiusFactor: number
  /**
   * The blob must have shrunk by at least this fraction over the frames
   * immediately before vanishing (see `shrinkWindowFrames`) for the vanish to
   * count as entering a hole. Guards against calling an occlusion-by-cable or
   * a tracking glitch a hole visit just because it happened nearby.
   */
  readonly shrinkFractionRequired: number
  /** How many recent tracked frames to look back over for the shrink check. */
  readonly shrinkWindowFrames: number
  /**
   * A gap shorter than this many frames is bridged for display (position
   * held at the last known point) while still being reported as LOST, never
   * silently treated as tracked. Sized in the state, not hidden in a value
   * used downstream, per the brief's requirement that gap-filling be visible.
   */
  readonly maxBridgedGapFrames: number
}

export const DEFAULT_TRACKER_PARAMS: TrackerParams = {
  holeProximityRadiusFactor: 1.5,
  shrinkFractionRequired: 0.25,
  shrinkWindowFrames: 5,
  maxBridgedGapFrames: 3,
}

export interface HoleRoi {
  readonly holes: readonly Point[]
  readonly holeRadius: number
  readonly targetHole: number | null
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearestHole(point: Point, roi: HoleRoi): { index: number; distance: number } | null {
  if (roi.holes.length === 0) return null
  let bestIndex = 0
  let bestDistance = distance(point, roi.holes[0]!)
  for (let i = 1; i < roi.holes.length; i++) {
    const d = distance(point, roi.holes[i]!)
    if (d < bestDistance) {
      bestDistance = d
      bestIndex = i
    }
  }
  return { index: bestIndex, distance: bestDistance }
}

/**
 * Incremental tracker: feed detections in frame order, get classified track
 * records back. Kept as a class (not a single pure function over the whole
 * array) because the nose-continuity and shrink-history checks need state
 * carried frame to frame, and a video's frames arrive one at a time from the
 * decoder rather than all at once.
 */
export class Tracker {
  private readonly roi: HoleRoi
  private readonly params: TrackerParams
  private readonly recentAreas: number[] = []
  /**
   * A short window of recent centroids, used only to estimate the direction
   * of travel for nose assignment. A single frame-to-frame delta is too
   * noisy to use directly: real per-frame position jitter (pixel
   * quantisation, minor detection noise) can flip its sign even when the
   * animal's true motion hasn't changed, which flips the nose to the tail
   * for a frame and back. Comparing against a point several frames back
   * instead averages the noise out while still tracking a genuine direction
   * change within a few frames' lag.
   */
  private readonly recentCentroidsForNose: Point[] = []
  private previousNose: Point | null = null
  private lastTrackedCentroid: Point | null = null
  private readonly records: FrameTrack[] = []
  /**
   * Set once at the start of a vanish streak and held for every subsequent
   * consecutive vanished frame, rather than re-derived each frame. Without
   * this, only the first frame of a multi-frame hole occlusion classified
   * correctly -- from the second vanished frame onward there was no longer a
   * "last tracked position" close enough to re-attribute, so the streak
   * incorrectly fell back to LOST partway through a real hole visit.
   */
  private currentVanishAttribution: { state: 'LOST' | 'OCCLUDED_IN_HOLE'; holeIndex: number | null } | null =
    null

  constructor(roi: HoleRoi, params: TrackerParams = DEFAULT_TRACKER_PARAMS) {
    this.roi = roi
    this.params = params
  }

  /** Classifies one frame's detection and returns its track record. */
  push(frameIndex: number, detection: Detection): FrameTrack {
    const record = detection.found
      ? this.trackFound(frameIndex, detection)
      : this.trackVanished(frameIndex)
    this.records.push(record)
    return record
  }

  private trackFound(frameIndex: number, detection: Detection): FrameTrack {
    const centroid = detection.centroid!
    const nose = this.assignNose(centroid, detection.axisEnds)

    this.recentAreas.push(detection.area)
    if (this.recentAreas.length > this.params.shrinkWindowFrames) this.recentAreas.shift()
    // Pushed after assignNose reads it, so the window used for direction
    // never includes the frame it's currently being computed for.
    this.recentCentroidsForNose.push(centroid)
    if (this.recentCentroidsForNose.length > Tracker.NOSE_DIRECTION_WINDOW) {
      this.recentCentroidsForNose.shift()
    }
    this.previousNose = nose
    this.lastTrackedCentroid = centroid
    this.currentVanishAttribution = null // any vanish streak has ended

    return {
      frameIndex,
      state: 'TRACKED',
      centroid,
      nose,
      area: detection.area,
      holeIndex: null,
    }
  }

  private trackVanished(frameIndex: number): FrameTrack {
    if (this.currentVanishAttribution === null) {
      // First frame of a new vanish streak: decide LOST vs OCCLUDED_IN_HOLE
      // now, from the last tracked position and the shrink history leading up
      // to it, and hold that decision for the rest of the streak.
      const attribution = this.lastTrackedCentroid
        ? nearestHole(this.lastTrackedCentroid, this.roi)
        : null
      const nearEnoughForAHole =
        attribution !== null &&
        attribution.distance <= this.roi.holeRadius * this.params.holeProximityRadiusFactor
      const shrunkEnough = this.recentlyShrunk()

      // Conservative on purpose: both proximity AND shrinkage are required.
      // Vanishing near a hole isn't enough by itself -- a tracking glitch
      // near a hole is still just a glitch, not a hole visit, unless the blob
      // was actually shrinking into it beforehand.
      const isHoleEntry = nearEnoughForAHole && shrunkEnough
      this.currentVanishAttribution = {
        state: isHoleEntry ? 'OCCLUDED_IN_HOLE' : 'LOST',
        holeIndex: isHoleEntry ? attribution!.index : null,
      }
      this.recentAreas.length = 0
      this.recentCentroidsForNose.length = 0
      // Nose identity resets on any vanish; there's no continuity to preserve
      // across an occlusion or a lost stretch.
      this.previousNose = null
    }

    return {
      frameIndex,
      state: this.currentVanishAttribution.state,
      centroid: null,
      nose: null,
      area: 0,
      holeIndex: this.currentVanishAttribution.holeIndex,
    }
  }

  /**
   * How many recent frames the direction-of-travel estimate is averaged
   * over. Widened from 5 to 10 (2026-09-04): nose position now drives more
   * than display -- hole-investigation proximity detection reads
   * `frame.nose` directly (see core/events.ts), so a jittery nose doesn't
   * just look bad, it fabricates short-lived investigation rows at
   * whichever hole the tail end swung toward. A longer averaging window
   * damps single-frame position noise (pixel quantisation, minor detection
   * jitter) further before it can flip which end reads as the nose.
   */
  private static readonly NOSE_DIRECTION_WINDOW = 10

  /**
   * Picks the leading axis endpoint as the nose: whichever end lies further
   * along the direction the body has been moving, estimated from a short
   * window of recent centroids rather than the single previous frame -- a
   * one-frame delta is dominated by per-frame position noise (pixel
   * quantisation, minor detection jitter) and can flip sign even when the
   * animal's real motion hasn't changed, which used to flip the nose to the
   * tail for a frame and back. Falls back to continuity with the previous
   * nose (whichever endpoint moved least) when the averaged direction is
   * still too small to be informative, so the nose doesn't flicker between
   * the two ends while the animal is nearly stationary.
   */
  private assignNose(
    centroid: Point,
    axisEnds: Detection['axisEnds'],
  ): Point | null {
    if (!axisEnds) return null
    const [a, b] = axisEnds

    const baseline = this.recentCentroidsForNose[0]
    if (baseline) {
      const framesSpanned = this.recentCentroidsForNose.length
      const displacement = { x: centroid.x - baseline.x, y: centroid.y - baseline.y }
      // Normalised back to px/frame so the threshold below means the same
      // thing regardless of how many frames the window currently spans.
      const speed = Math.hypot(displacement.x, displacement.y) / framesSpanned
      // Below this the direction estimate is mostly noise. Raised from 0.5
      // to 1.5 (2026-09-04, same reasoning as the wider window above): at
      // 0.5px/frame over the old 5-frame window, 2.5px of accumulated
      // jitter -- well within ordinary per-frame detection noise for a
      // small animal -- was enough to register as "real" motion and swap
      // the nose. A higher bar means the tracker defers to continuity
      // (keep the previous nose) far more often while the animal is
      // essentially stationary, which is what "stopped" should look like.
      const MIN_INFORMATIVE_SPEED = 1.5
      if (speed >= MIN_INFORMATIVE_SPEED) {
        const dotA = (a.x - centroid.x) * displacement.x + (a.y - centroid.y) * displacement.y
        const dotB = (b.x - centroid.x) * displacement.x + (b.y - centroid.y) * displacement.y
        return dotA >= dotB ? a : b
      }
    }

    if (this.previousNose) {
      return distance(a, this.previousNose) <= distance(b, this.previousNose) ? a : b
    }

    // No history at all (first tracked frame): no principled way to choose,
    // so pick deterministically rather than arbitrarily-looking-random.
    return a
  }

  private recentlyShrunk(): boolean {
    if (this.recentAreas.length < 2) return false
    const first = this.recentAreas[0]!
    const last = this.recentAreas[this.recentAreas.length - 1]!
    if (first <= 0) return false
    return (first - last) / first >= this.params.shrinkFractionRequired
  }

  /**
   * Call once all frames are pushed. Promotes a trailing OCCLUDED_IN_HOLE run
   * at the target hole to IN_ESCAPE_BOX when it runs to the end of the clip
   * without the animal reappearing -- the animal escaped, not merely visited.
   * A hole visit that is later followed by TRACKED frames is never escape,
   * regardless of which hole it was. Then covers the case the vanish-based
   * state machine cannot: see `promoteTrailingShrinkIntoHoleRun`.
   */
  finalize(): FrameTrack[] {
    this.promoteTrailingOccludedRun()
    this.promoteTrailingShrinkIntoHoleRun()
    return this.records
  }

  private promoteTrailingOccludedRun(): void {
    if (this.roi.targetHole === null) return
    let i = this.records.length - 1
    while (
      i >= 0 &&
      this.records[i]!.state === 'OCCLUDED_IN_HOLE' &&
      this.records[i]!.holeIndex === this.roi.targetHole
    ) {
      i--
    }
    const runStart = i + 1
    if (runStart >= this.records.length) return // no such trailing run
    for (let j = runStart; j < this.records.length; j++) {
      this.records[j] = { ...this.records[j]!, state: 'IN_ESCAPE_BOX' }
    }
  }

  /**
   * Catches an escape (or a deep hole visit) the vanish-based state machine
   * structurally cannot: on real footage (measured directly on `test51` and
   * `test53`'s own tracked output, not assumed), the classical detector's
   * connected-components sometimes never drops the blob's area to zero as
   * the animal enters a hole -- a residual sliver stays visible, so
   * `detection.found` never goes false and the frame never reaches
   * `trackVanished()` at all, however small or however close to a hole it
   * gets. Measured on `test53`: the trailing ~165 frames sit within a few px
   * of one hole (well inside `holeProximityRadiusFactor x holeRadius`) while
   * area falls from ~456 (near the clip's own median of 460) to 139 and
   * never recovers before the clip ends -- the same real event
   * OCCLUDED_IN_HOLE already exists to represent, just without a full
   * vanish to key off. Reuses the same conservative proximity+shrink gate as
   * the vanish-based path, scored across the trailing near-hole run itself
   * (its first frame's area vs. its last) rather than a fixed backward
   * window, since there is no vanish frame here to anchor a window to.
   * Promotes to IN_ESCAPE_BOX only at the target hole, mirroring
   * `promoteTrailingOccludedRun`; any other hole promotes to
   * OCCLUDED_IN_HOLE, the same "a real, deep hole visit, not an escape"
   * meaning that state already carries everywhere else.
   */
  private promoteTrailingShrinkIntoHoleRun(): void {
    if (this.records.length === 0) return
    const lastFrame = this.records[this.records.length - 1]!
    if (lastFrame.state !== 'TRACKED' || !lastFrame.centroid) return

    const proximityRadius = this.roi.holeRadius * this.params.holeProximityRadiusFactor
    const lastNear = nearestHole(lastFrame.centroid, this.roi)
    if (lastNear === null || lastNear.distance > proximityRadius) return
    const holeIndex = lastNear.index

    // Walk back while frames stay TRACKED and near that *same* hole -- a run
    // that visited a different hole partway through isn't one continuous visit.
    let i = this.records.length - 1
    while (i >= 0) {
      const record = this.records[i]!
      if (record.state !== 'TRACKED' || !record.centroid) break
      const near = nearestHole(record.centroid, this.roi)
      if (near === null || near.index !== holeIndex || near.distance > proximityRadius) break
      i--
    }
    const runStart = i + 1
    if (runStart >= this.records.length) return

    const startArea = this.records[runStart]!.area
    const endArea = this.records[this.records.length - 1]!.area
    if (startArea <= 0) return
    const shrunkEnough = (startArea - endArea) / startArea >= this.params.shrinkFractionRequired
    if (!shrunkEnough) return

    const nextState: TrackState = holeIndex === this.roi.targetHole ? 'IN_ESCAPE_BOX' : 'OCCLUDED_IN_HOLE'
    for (let j = runStart; j < this.records.length; j++) {
      this.records[j] = {
        ...this.records[j]!,
        state: nextState,
        centroid: null,
        nose: null,
        area: 0,
        holeIndex,
      }
    }
  }
}
