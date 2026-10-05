import { invoke } from '@tauri-apps/api/core'
import type { CloudAccess } from '@/core/cloud/transport'
import { AppFailure, createAppError, type AppErrorKind } from '@/core/errors'

/** The native side's failure kinds, as the app's own. */
const KINDS: Record<string, AppErrorKind> = {
  'missing-key': 'missing-api-key',
  offline: 'offline',
  timeout: 'timeout',
}

/** Turns what a failed native command rejects with into the app's own error. */
function toFailure(cause: unknown): AppFailure {
  const { kind, detail } = (typeof cause === 'object' && cause !== null ? cause : {}) as {
    kind?: unknown
    detail?: unknown
  }
  const text = typeof detail === 'string' ? detail : String(cause)
  return new AppFailure(
    createAppError((typeof kind === 'string' && KINDS[kind]) || 'provider-unavailable', text),
  )
}

/**
 * Cloud services in the desktop app. Keys sit in the Windows Credential
 * Manager and requests leave from the native side, which attaches the key
 * there: the web view never holds one after it has been saved.
 */
export function createNativeCloud(): CloudAccess {
  return {
    transport: {
      async send(provider, request) {
        try {
          return await invoke('cloud_request', {
            provider,
            method: request.method,
            path: request.path,
            body: request.body === undefined ? null : JSON.stringify(request.body),
          })
        } catch (cause) {
          throw toFailure(cause)
        }
      },
    },
    keys: {
      has: (provider) => invoke('secret_exists', { provider }),
      set: (provider, key) => invoke('secret_set', { provider, key }),
      remove: (provider) => invoke('secret_delete', { provider }),
    },
  }
}
