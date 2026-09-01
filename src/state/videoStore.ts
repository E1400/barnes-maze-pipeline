/**
 * IndexedDB persistence for loaded videos.
 *
 * Writes happen as the user works -- there is no "save" button anywhere in
 * this tool. A reload, a crashed tab, or a closed laptop must never cost the
 * user annotation work.
 */

import { DB_NAME, DB_VERSION, STORE_VIDEOS } from './schema.ts'
import type { StoredVideo, StoredVideoSummary } from './schema.ts'
import { runMigrations } from './migrations.ts'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      const transaction = request.transaction
      if (!transaction) throw new Error('Upgrade transaction missing')
      runMigrations(db, transaction, event.oldVersion, event.newVersion ?? DB_VERSION)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open database'))
    request.onblocked = () =>
      reject(
        new Error(
          'Another tab has an older version of this tool open. Close it and reload.',
        ),
      )
  })
  return dbPromise
}

/** Test seam: drops the cached handle so a fresh open happens next call. */
export function resetDatabaseHandle(): void {
  dbPromise = null
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_VIDEOS, mode)
        const request = work(transaction.objectStore(STORE_VIDEOS))
        // Resolve on transaction completion, not request success: for writes,
        // only completion means the data actually reached disk.
        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('Database transaction failed'))
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('Database transaction aborted'))
      }),
  )
}

export function putVideo(video: StoredVideo): Promise<IDBValidKey> {
  return runTransaction('readwrite', (store) => store.put(video))
}

export function deleteVideo(id: string): Promise<undefined> {
  return runTransaction('readwrite', (store) => store.delete(id))
}

export function getVideo(id: string): Promise<StoredVideo | undefined> {
  return runTransaction('readonly', (store) => store.get(id) as IDBRequest<StoredVideo | undefined>)
}

/** Summaries only -- the UI list does not need to hold every video blob in memory. */
export async function listVideos(): Promise<StoredVideoSummary[]> {
  const all = await runTransaction('readonly', (store) =>
    store.getAll() as IDBRequest<StoredVideo[]>,
  )
  return all
    .map(({ blob: _blob, ...summary }) => summary)
    .sort((a, b) => a.addedAt - b.addedAt)
}
