/**
 * Persistence for ROI definitions.
 *
 * Same rule as the video store: writes happen as the user works. Placing
 * twenty holes and then losing them to a refresh would be the single most
 * annoying possible failure of this tool.
 */

import {
  DB_VERSION,
  KEY_ROI_TEMPLATE,
  STORE_ROIS,
  STORE_SETTINGS,
} from './schema.ts'
import type { StoredRoi, StoredRoiTemplate } from './schema.ts'
import { roiCompleteness, type RoiDefinition } from '../core/roi.ts'
import { openDatabase } from './videoStore.ts'

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const request = work(transaction.objectStore(storeName))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

export function saveRoi(
  videoId: string,
  roi: RoiDefinition,
  pins: readonly number[] = [],
): Promise<IDBValidKey> {
  const record: StoredRoi = {
    videoId,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    roi,
    pins,
  }
  return runTransaction(STORE_ROIS, 'readwrite', (store) => store.put(record))
}

export async function loadRoi(
  videoId: string,
): Promise<{ roi: RoiDefinition; pins: number[] } | null> {
  const record = await runTransaction(STORE_ROIS, 'readonly', (store) =>
    store.get(videoId) as IDBRequest<StoredRoi | undefined>,
  )
  if (!record) return null
  // Records written before pins existed simply have none.
  return { roi: record.roi, pins: [...(record.pins ?? [])] }
}

export function deleteRoi(videoId: string): Promise<undefined> {
  return runTransaction(STORE_ROIS, 'readwrite', (store) => store.delete(videoId))
}

/**
 * Updates only the pinned frames for a video, leaving its ROI untouched.
 *
 * Deliberately does not take a `roi` parameter. A caller that isn't the ROI
 * editor itself (the correction viewer also has a pin toggle, on the same
 * per-video pin list) only has `roi` as a prop passed down from a shared
 * ancestor, and that prop is briefly stale immediately after switching
 * videos -- the new video's components can render once before the ancestor's
 * own state has caught up. A pins update that also writes `roi` would
 * overwrite the correct, already-persisted ROI with that stale value. This
 * does a read-modify-write inside one IndexedDB transaction instead: it
 * reads whatever ROI is *actually* stored for this video right now and keeps
 * it exactly as is, changing only `pins`. If no ROI record exists yet for
 * this video, there is nothing to attach pins to, so it does nothing --
 * matching the existing behaviour where pins were never saved before a
 * layout existed either.
 */
export function updatePins(videoId: string, pins: readonly number[]): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_ROIS, 'readwrite')
        const store = transaction.objectStore(STORE_ROIS)
        const getRequest = store.get(videoId) as IDBRequest<StoredRoi | undefined>
        getRequest.onsuccess = () => {
          const existing = getRequest.result
          if (!existing) return
          const updated: StoredRoi = { ...existing, pins, updatedAt: Date.now() }
          store.put(updated)
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

/**
 * Video ids that have a usable maze layout saved, for the video table's
 * per-row status. A ring with no holes doesn't count as "defined" -- same
 * bar as `roiCompleteness(...).hasRing` uses everywhere else.
 */
export async function listDefinedVideoIds(): Promise<Set<string>> {
  const records = await runTransaction(STORE_ROIS, 'readonly', (store) =>
    store.getAll() as IDBRequest<StoredRoi[]>,
  )
  return new Set(
    records.filter((r) => roiCompleteness(r.roi).hasRing).map((r) => r.videoId),
  )
}

/** Stores the ROI to offer as a starting point on the next video. */
export function saveRoiTemplate(
  roi: RoiDefinition,
  sourceVideoName: string,
): Promise<IDBValidKey> {
  const record: StoredRoiTemplate = {
    key: KEY_ROI_TEMPLATE,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    sourceVideoName,
    roi,
  }
  return runTransaction(STORE_SETTINGS, 'readwrite', (store) => store.put(record))
}

export function loadRoiTemplate(): Promise<StoredRoiTemplate | undefined> {
  return runTransaction(STORE_SETTINGS, 'readonly', (store) =>
    store.get(KEY_ROI_TEMPLATE) as IDBRequest<StoredRoiTemplate | undefined>,
  )
}
