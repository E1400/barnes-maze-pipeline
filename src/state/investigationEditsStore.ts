/**
 * Persistence for manual add/delete/edit overlays on the investigation list.
 *
 * Same overlay-not-mutation shape as `correctionStore.ts`: the detector's own
 * output is never touched, only the edits layered on top of it.
 */

import { DB_VERSION, STORE_INVESTIGATION_EDITS } from './schema.ts'
import type { StoredInvestigationEdits } from './schema.ts'
import { EMPTY_INVESTIGATION_EDITS, type InvestigationEdits } from '../core/investigationEdits.ts'
import { openDatabase } from './videoStore.ts'

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_INVESTIGATION_EDITS, mode)
        const request = work(transaction.objectStore(STORE_INVESTIGATION_EDITS))
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

export function saveInvestigationEdits(
  videoId: string,
  edits: InvestigationEdits,
): Promise<IDBValidKey> {
  const record: StoredInvestigationEdits = {
    videoId,
    schemaVersion: DB_VERSION,
    updatedAt: Date.now(),
    edits,
  }
  return runTransaction('readwrite', (store) => store.put(record))
}

export async function loadInvestigationEdits(videoId: string): Promise<InvestigationEdits> {
  const record = await runTransaction('readonly', (store) =>
    store.get(videoId) as IDBRequest<StoredInvestigationEdits | undefined>,
  )
  return record?.edits ?? EMPTY_INVESTIGATION_EDITS
}

export function deleteInvestigationEdits(videoId: string): Promise<undefined> {
  return runTransaction('readwrite', (store) => store.delete(videoId))
}
