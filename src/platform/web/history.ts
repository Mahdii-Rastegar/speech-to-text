import { newestFirst, parseStoredSession, type HistoryRepository } from '@/core/history/repository'
import type { TranscriptionSession } from '@/core/session'

const DATABASE = 'stt-app.history'
const STORE = 'sessions'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('The history database is held by another tab'))
  })
}

/** History in the browser's own storage (IndexedDB), for the web build. */
export function createBrowserHistory(): HistoryRepository {
  let database: Promise<IDBDatabase> | undefined

  /** Runs one request in its own transaction and resolves once that is written. */
  async function run<T>(
    mode: IDBTransactionMode,
    request: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    // A failed opening is tried again on the next call instead of being remembered.
    database ??= open().catch((cause: unknown) => {
      database = undefined
      throw cause
    })
    const transaction = (await database).transaction(STORE, mode)
    return new Promise<T>((resolve, reject) => {
      const pending = request(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(pending.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }

  return {
    async list() {
      const stored = await run<unknown[]>('readonly', (store) => store.getAll())
      const sessions = stored
        .map(parseStoredSession)
        .filter((session): session is TranscriptionSession => session !== null)
      return newestFirst(sessions)
    },
    async save(session) {
      await run('readwrite', (store) => store.put(session))
    },
    async remove(id) {
      await run('readwrite', (store) => store.delete(id))
    },
    async clear() {
      await run('readwrite', (store) => store.clear())
    },
  }
}
