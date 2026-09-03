/**
 * Persisted schema. Versioned from the first commit on purpose: this database
 * will hold hours of a user's manual corrections, and a migration path that is
 * added later is a migration path that starts by discarding someone's work.
 */

import type { RoiDefinition } from '../core/roi.ts'
import type { DetectionParams } from '../core/cv/detector.ts'
import type { FrameTrack, TrackerParams } from '../core/tracking.ts'
import type { PositionCorrection } from '../core/corrections.ts'
import type { InvestigationParams } from '../core/events.ts'
import type { InvestigationEdits } from '../core/investigationEdits.ts'
import type { MeasureOverrides } from '../core/measureOverrides.ts'
import type { Timebase } from '../core/timebase.ts'

/**
 * Bump when the *shape* of a stored record changes, and add a migration in
 * `migrations.ts`. This is the IndexedDB `version`, so bumping it triggers
 * `onupgradeneeded`.
 */
export const DB_VERSION = 7

export const DB_NAME = 'barnes-maze-pipeline'

export const STORE_VIDEOS = 'videos'
/** One ROI definition per video, keyed by video id. */
export const STORE_ROIS = 'rois'
/** Small key/value store for cross-video settings, e.g. the ROI template. */
export const STORE_SETTINGS = 'settings'

/** Key under which the reusable ROI template lives in STORE_SETTINGS. */
export const KEY_ROI_TEMPLATE = 'roiTemplate'
/**
 * Key under which the facility's default platform diameter lives in
 * STORE_SETTINGS. A rig's platform doesn't change between trials, so this is
 * entered once, prominently, at video-load time and seeds every new ROI's
 * own (still independently editable) diameter field.
 */
export const KEY_DEFAULT_DIAMETER = 'defaultPlatformDiameterCm'
/**
 * Key under which the hole-investigation threshold lives in STORE_SETTINGS.
 * Global, not per-video (revised 2026-09-03): a facility scores every video
 * in a study against the same criteria, so a value set once should be the
 * standard for every video after it, not something re-chosen per clip. The
 * old per-video store (STORE_INVESTIGATION_PARAMS, below) is left in the
 * schema unused rather than migrated -- no destructive migration needed for
 * a value the UI simply stops reading and writing.
 */
export const KEY_INVESTIGATION_PARAMS = 'globalInvestigationParams'
/** One tracking run's results per video, keyed by video id. */
export const STORE_TRACKS = 'tracks'
/** Manual position corrections per video, keyed by video id. */
export const STORE_CORRECTIONS = 'corrections'
/** @deprecated Superseded by the KEY_INVESTIGATION_PARAMS global setting. Left in the schema, unused, so existing per-video records aren't orphaned by a store deletion. */
export const STORE_INVESTIGATION_PARAMS = 'investigationParams'
/** Manual add/delete/edit overlay on the detected investigation list, per video. */
export const STORE_INVESTIGATION_EDITS = 'investigationEdits'
/** Manual overrides on computed per-trial measures (including the search-strategy label), per video. */
export const STORE_MEASURE_OVERRIDES = 'measureOverrides'

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

/**
 * Manual position corrections for one video. Stored as a plain object keyed
 * by frame index (IndexedDB structured-clone handles a `Map` fine, but a
 * plain object matches every other record in this schema and needs no
 * special-casing to inspect or migrate later).
 */
export interface StoredCorrections {
  readonly videoId: string
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly corrections: Readonly<Record<number, PositionCorrection>>
}

/**
 * The hole-investigation threshold last used for one video, so a chosen
 * threshold survives a reload -- the computed measures themselves are cheap
 * to recompute and are never stored, only the parameters that produced them.
 */
export interface StoredInvestigationParams {
  readonly videoId: string
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly investigationParams: InvestigationParams
}

/** Manual add/delete/edit overlay on one video's detected investigation list. */
export interface StoredInvestigationEdits {
  readonly videoId: string
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly edits: InvestigationEdits
}

/** The facility's default platform diameter, applied to every newly created ROI. */
export interface StoredDefaultDiameter {
  readonly key: typeof KEY_DEFAULT_DIAMETER
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly diameterCm: number
}

/** The global hole-investigation threshold, shared by every video. */
export interface StoredGlobalInvestigationParams {
  readonly key: typeof KEY_INVESTIGATION_PARAMS
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly investigationParams: InvestigationParams
}

/** Manual overrides on one video's computed per-trial measures. */
export interface StoredMeasureOverrides {
  readonly videoId: string
  readonly schemaVersion: number
  readonly updatedAt: number
  readonly overrides: MeasureOverrides
}
