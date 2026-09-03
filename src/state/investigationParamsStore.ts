/**
 * Persistence for the hole-investigation threshold.
 *
 * Global (revised 2026-09-03), not per-video: a facility scores every video
 * in a study against the same criteria, so a value set once should be the
 * standard for every later video, not something re-chosen per clip -- see
 * CLAUDE.md. Stored under a settings key, same shape as the default
 * platform diameter.
 */

import { DB_VERSION, KEY_INVESTIGATION_PARAMS, STORE_SETTINGS } from './schema.ts'
import type { StoredGlobalInvestigationParams } from './schema.ts'
import type { InvestigationParams } from '../core/events.ts'
import { openDatabase } from './videoStore.ts'

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_SETTINGS, mode)
        const request = work(transaction.objectStore(STORE_SETTINGS))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

export function saveInvestigationParams(investigationParams: InvestigationParams): Promise<IDBValidKey> {
  const record: StoredGlobalInvestigationParams = {
    key: KEY_INVESTIGATION_PARAMS,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    investigationParams,
  }
  return runTransaction('readwrite', (store) => store.put(record))
}

export async function loadInvestigationParams(): Promise<InvestigationParams | null> {
  const record = await runTransaction('readonly', (store) =>
    store.get(KEY_INVESTIGATION_PARAMS) as IDBRequest<StoredGlobalInvestigationParams | undefined>,
  )
  return record?.investigationParams ?? null
}
