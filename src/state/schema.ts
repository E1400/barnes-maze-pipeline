/**
 * Persisted schema. Versioned from the first commit on purpose: this database
 * will hold hours of a user's manual corrections, and a migration path that is
 * added later is a migration path that starts by discarding someone's work.
 */

import type { RoiDefinition } from '../core/roi.ts'
import type { DetectionParams } from '../core/cv/detector.ts'
import type { FrameTrack, TrackerParams } from '../core/tracking.ts'
import type { Timebase } from '../core/timebase.ts'

/**
 * Bump when the *shape* of a stored record changes, and add a migration in
 * `migrations.ts`. This is the IndexedDB `version`, so bumping it triggers
 * `onupgradeneeded`.
 */
export const DB_VERSION = 3

export const DB_NAME = 'barnes-maze-pipeline'

export const STORE_VIDEOS = 'videos'
/** One ROI definition per video, keyed by video id. */
export const STORE_ROIS = 'rois'
/** Small key/value store for cross-video settings, e.g. the ROI template. */
export const STORE_SETTINGS = 'settings'

/** Key under which the reusable ROI template lives in STORE_SETTINGS. */
export const KEY_ROI_TEMPLATE = 'roiTemplate'
/** One tracking run's results per video, keyed by video id. */
export const STORE_TRACKS = 'tracks'

/**
 * A video the user has loaded, with everything needed to redisplay it after a
 * reload without re-reading the container.
 */
export interface StoredVideo {
  /** Stable id: `${name}:${size}:${lastModified}`, so re-adding a file replaces it. */
  readonly id: string
  readonly name: string
  readonly size: number
  /** MIME type as reported by the browser, e.g. "video/mp4". */
  readonly mimeType: string
  /** Epoch ms when the user added it. */
  readonly addedAt: number
  /** Record-shape version, mirrored on the record so migrations can be selective. */
  readonly schemaVersion: number
  /** Parsed from the container -- never assumed. See core/timebase.ts. */
  readonly timebase: Timebase
  /** The file itself. Structured-cloned into IndexedDB; never uploaded. */
  readonly blob: Blob
}

/** Everything except the blob -- what the UI needs to render a list. */
export type StoredVideoSummary = Omit<StoredVideo, 'blob'>

export function videoId(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

/** A video's ROI, as stored. Keyed by the video it belongs to. */
export interface StoredRoi {
  readonly videoId: string
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly roi: RoiDefinition
  /** Frame indices the user pinned as worth returning to. */
  readonly pins: readonly number[]
}

/**
 * The ROI carried over to the next video loaded. A facility films the same rig
 * repeatedly, so the ring from the last video is nearly always a better
 * starting point than three fresh clicks -- the user nudges from there.
 */
export interface StoredRoiTemplate {
  readonly key: typeof KEY_ROI_TEMPLATE
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly sourceVideoName: string
  readonly roi: RoiDefinition
}

/** A completed tracking run for one video, with the parameters that produced it. */
export interface StoredTrack {
  readonly videoId: string
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly tracks: readonly FrameTrack[]
  readonly detectionParams: DetectionParams
  readonly trackerParams: TrackerParams
}
