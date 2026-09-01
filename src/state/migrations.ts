/**
 * IndexedDB upgrade path.
 *
 * Each version's step runs in order for a database being upgraded from any
 * older version, so a user who last opened the tool at v1 and returns at v4
 * gets v2, v3, then v4 applied in sequence. Steps must be idempotent-safe and
 * must never drop a store that holds user work.
 */

import { DB_VERSION, STORE_VIDEOS } from './schema.ts'

type UpgradeStep = (db: IDBDatabase, transaction: IDBTransaction) => void

/** Keyed by the version each step upgrades *to*. */
const STEPS: Record<number, UpgradeStep> = {
  1: (db) => {
    if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
      const store = db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' })
      // Lists are shown newest-first; an index avoids sorting the blobs.
      store.createIndex('addedAt', 'addedAt', { unique: false })
    }
  },
}

export function runMigrations(
  db: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
  newVersion: number,
): void {
  for (let version = oldVersion + 1; version <= newVersion; version++) {
    STEPS[version]?.(db, transaction)
  }
}

export { DB_VERSION }
