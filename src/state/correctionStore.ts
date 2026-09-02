/**
 * Persistence for manual position corrections.
 *
 * Same rule as everywhere else in this tool: writes happen as the user
 * works, no explicit save. Losing a hand-placed correction to a reload would
 * mean re-finding and re-fixing the exact same frame.
 */

import { DB_VERSION, STORE_CORRECTIONS } from './schema.ts'
import type { StoredCorrections } from './schema.ts'
import type { Corrections, PositionCorrection } from '../core/corrections.ts'
import { openDatabase } from './videoStore.ts'

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_CORRECTIONS, mode)
        const request = work(transaction.objectStore(STORE_CORRECTIONS))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

export function saveCorrections(videoId: string, corrections: Corrections): Promise<IDBValidKey> {
  const record: StoredCorrections = {
    videoId,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    corrections: Object.fromEntries(corrections) as Record<number, PositionCorrection>,
  }
  return runTransaction('readwrite', (store) => store.put(record))
}

export async function loadCorrections(videoId: string): Promise<Corrections> {
  const record = await runTransaction('readonly', (store) =>
    store.get(videoId) as IDBRequest<StoredCorrections | undefined>,
  )
  if (!record) return new Map()
  // Object keys are always strings; frame indices need converting back.
  return new Map(Object.entries(record.corrections).map(([key, value]) => [Number(key), value]))
}

export function deleteCorrections(videoId: string): Promise<undefined> {
  return runTransaction('readwrite', (store) => store.delete(videoId))
}
