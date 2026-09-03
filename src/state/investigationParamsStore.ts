/**
 * Persistence for the per-video hole-investigation threshold.
 *
 * The threshold has to be "visible and adjustable, not a buried constant"
 * (CLAUDE.md); this is the other half of that requirement -- a chosen value
 * has to survive a reload, same as everything else the user sets by hand.
 */

import { DB_VERSION, STORE_INVESTIGATION_PARAMS } from './schema.ts'
import type { StoredInvestigationParams } from './schema.ts'
import type { InvestigationParams } from '../core/events.ts'
import { openDatabase } from './videoStore.ts'

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_INVESTIGATION_PARAMS, mode)
        const request = work(transaction.objectStore(STORE_INVESTIGATION_PARAMS))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

export function saveInvestigationParams(
  videoId: string,
  investigationParams: InvestigationParams,
): Promise<IDBValidKey> {
  const record: StoredInvestigationParams = {
    videoId,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    investigationParams,
  }
  return runTransaction('readwrite', (store) => store.put(record))
}

export async function loadInvestigationParams(
  videoId: string,
): Promise<InvestigationParams | null> {
  const record = await runTransaction('readonly', (store) =>
    store.get(videoId) as IDBRequest<StoredInvestigationParams | undefined>,
  )
  return record?.investigationParams ?? null
}

export function deleteInvestigationParams(videoId: string): Promise<undefined> {
  return runTransaction('readwrite', (store) => store.delete(videoId))
}
