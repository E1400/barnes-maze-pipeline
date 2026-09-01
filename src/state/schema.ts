/**
 * Persisted schema. Versioned from the first commit on purpose: this database
 * will hold hours of a user's manual corrections, and a migration path that is
 * added later is a migration path that starts by discarding someone's work.
 */

import type { Timebase } from '../core/timebase.ts'

/**
 * Bump when the *shape* of a stored record changes, and add a migration in
 * `migrations.ts`. This is the IndexedDB `version`, so bumping it triggers
 * `onupgradeneeded`.
 */
export const DB_VERSION = 1

export const DB_NAME = 'barnes-maze-pipeline'

export const STORE_VIDEOS = 'videos'

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
