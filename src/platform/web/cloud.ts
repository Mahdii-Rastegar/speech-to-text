import {
  isPlainPath,
  type CloudAccess,
  type CloudProviderId,
  type KeyVault,
} from '@/core/cloud/transport'
import { AppFailure, createAppError } from '@/core/errors'

/** Each service has one fixed address; only a path below it can be asked for. */
const BASE_URLS: Record<CloudProviderId, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
}

/** The header each service expects the key in. */
const authHeader = (provider: CloudProviderId, key: string): Record<string, string> =>
  provider === 'openrouter' ? { Authorization: `Bearer ${key}` } : { 'x-goog-api-key': key }

/** Long transcripts take a while to rewrite; past this the user is better told than kept waiting. */
const TIMEOUT_MS = 180_000

const DATABASE = 'stt-app.keys'
const STORE = 'keys'
/** The entry that holds the key the others are encrypted with. */
const WRAPPING_ID = 'wrapping-key'

interface StoredSecret {
  id: CloudProviderId
  iv: Uint8Array<ArrayBuffer>
  data: ArrayBuffer
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('The key store is held by another tab'))
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await open()
  try {
    const transaction = database.transaction(STORE, mode)
    return await new Promise<T>((resolve, reject) => {
      const pending = request(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(pending.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

/**
 * The key the API keys are encrypted with. The browser keeps it as an object
 * whose bytes cannot be read out, so what sits in storage (and in a backup of
 * it) is not a usable API key. Code running in this page can still use it:
 * a browser has no place that is out of the page's own reach.
 */
async function wrappingKey(): Promise<CryptoKey> {
  const stored = await run<{ key: CryptoKey } | undefined>('readonly', (store) =>
    store.get(WRAPPING_ID),
  )
  if (stored) return stored.key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await run('readwrite', (store) => store.put({ id: WRAPPING_ID, key }))
  return key
}

async function readKey(provider: CloudProviderId): Promise<string | null> {
  const secret = await run<StoredSecret | undefined>('readonly', (store) => store.get(provider))
  if (!secret) return null
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: secret.iv },
    await wrappingKey(),
    secret.data,
  )
  return new TextDecoder().decode(plain)
}

/** A key goes into a request header, so it may only hold what a header can carry. */
const KEY_SHAPE = /^[\x21-\x7e]{8,512}$/

const keys: KeyVault = {
  has: async (provider) =>
    (await run<IDBValidKey | undefined>('readonly', (store) => store.getKey(provider))) !==
    undefined,
  async set(provider, key) {
    const trimmed = key.trim()
    if (!KEY_SHAPE.test(trimmed)) throw new Error('Not a key')
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await wrappingKey(),
      new TextEncoder().encode(trimmed),
    )
    const secret: StoredSecret = { id: provider, iv, data }
    await run('readwrite', (store) => store.put(secret))
  },
  async remove(provider) {
    await run('readwrite', (store) => store.delete(provider))
  },
}

/**
 * Cloud services in the web app (the iPhone PWA). There is no native side
 * here, so requests go from the page straight to the service, and the key is
 * kept encrypted in the browser's own storage. The stored key is read only
 * here, at the moment a request is sent.
 */
export function createBrowserCloud(): CloudAccess {
  return {
    transport: {
      async send(provider, request) {
        if (!isPlainPath(request.path)) {
          throw new AppFailure(createAppError('unknown', 'The request path is not allowed'))
        }
        const key = await readKey(provider).catch(() => null)
        if (key === null) throw new AppFailure(createAppError('missing-api-key'))

        let response: Response
        try {
          response = await fetch(`${BASE_URLS[provider]}${request.path}`, {
            method: request.method,
            headers: {
              ...authHeader(provider, key),
              ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: request.body === undefined ? undefined : JSON.stringify(request.body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            // Nothing but the key travels with the request: no cookies, no page address.
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            redirect: 'error',
          })
          return { status: response.status, body: await response.text() }
        } catch (cause) {
          const name = cause instanceof Error ? cause.name : ''
          if (name === 'TimeoutError') throw new AppFailure(createAppError('timeout'))
          // A browser does not say why a request got no answer. With a
          // connection up, the usual reason is a service that refuses this network.
          const kind = navigator.onLine ? 'provider-blocked' : 'offline'
          throw new AppFailure(createAppError(kind, cause instanceof Error ? cause.message : name))
        }
      },
    },
    keys,
  }
}
