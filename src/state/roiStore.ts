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
import type { RoiDefinition } from '../core/roi.ts'
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
