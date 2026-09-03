/**
 * Persistence for manual overrides on one video's computed measures.
 *
 * Same overlay-not-mutation shape as `correctionStore.ts` and
 * `investigationEditsStore.ts`: the computed measures are never touched,
 * only the overrides layered on top of them.
 */

import { DB_VERSION, STORE_MEASURE_OVERRIDES } from './schema.ts'
import type { StoredMeasureOverrides } from './schema.ts'
import { EMPTY_MEASURE_OVERRIDES, type MeasureOverrides } from '../core/measureOverrides.ts'
import { openDatabase } from './videoStore.ts'

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_MEASURE_OVERRIDES, mode)
        const request = work(transaction.objectStore(STORE_MEASURE_OVERRIDES))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

export function saveMeasureOverrides(videoId: string, overrides: MeasureOverrides): Promise<IDBValidKey> {
  const record: StoredMeasureOverrides = {
    videoId,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    overrides,
  }
  return runTransaction('readwrite', (store) => store.put(record))
}

export async function loadMeasureOverrides(videoId: string): Promise<MeasureOverrides> {
  const record = await runTransaction('readonly', (store) =>
    store.get(videoId) as IDBRequest<StoredMeasureOverrides | undefined>,
  )
  return record?.overrides ?? EMPTY_MEASURE_OVERRIDES
}

export function deleteMeasureOverrides(videoId: string): Promise<undefined> {
  return runTransaction('readwrite', (store) => store.delete(videoId))
}
