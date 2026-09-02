/**
 * Persistence for tracking results.
 *
 * A tracking run costs real time (measured: single-digit seconds to several
 * minutes, depending on clip length -- see AI_NOTES). Losing that to a
 * reload would mean re-running it, so results are saved as soon as a run
 * completes, same as everything else in this tool.
 */

import { DB_VERSION, STORE_TRACKS } from './schema.ts'
import type { StoredTrack } from './schema.ts'
import type { DetectionParams } from '../core/cv/detector.ts'
import type { FrameTrack, TrackerParams } from '../core/tracking.ts'
import { openDatabase } from './videoStore.ts'

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_TRACKS, mode)
        const request = work(transaction.objectStore(STORE_TRACKS))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

export function saveTracks(
  videoId: string,
  tracks: readonly FrameTrack[],
  detectionParams: DetectionParams,
  trackerParams: TrackerParams,
): Promise<IDBValidKey> {
  const record: StoredTrack = {
    videoId,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    tracks,
    detectionParams,
    trackerParams,
  }
  return runTransaction('readwrite', (store) => store.put(record))
}

export async function loadTracks(videoId: string): Promise<StoredTrack | null> {
  const record = await runTransaction('readonly', (store) =>
    store.get(videoId) as IDBRequest<StoredTrack | undefined>,
  )
  return record ?? null
}

export function deleteTracks(videoId: string): Promise<undefined> {
  return runTransaction('readwrite', (store) => store.delete(videoId))
}
