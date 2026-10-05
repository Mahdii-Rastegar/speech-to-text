import { Channel, invoke } from '@tauri-apps/api/core'
import type { DownloadProgress, LocalModels, ModelFailureKind } from '@/core/models/localModels'

const FAILURES: readonly ModelFailureKind[] = ['offline', 'timeout', 'blocked', 'corrupt', 'disk']

/** The native side's failure kinds, as the interface's own. */
function failureKind(cause: unknown): ModelFailureKind | 'cancelled' {
  const { kind } = (typeof cause === 'object' && cause !== null ? cause : {}) as { kind?: unknown }
  if (kind === 'cancelled') return 'cancelled'
  return FAILURES.find((known) => known === kind) ?? 'failed'
}

/**
 * The local engine's model files in the desktop app. They sit in the `models`
 * folder beside the app and are fetched by the native side, so the web view's
 * rule of talking to nothing but the app itself stays as it is.
 */
export function createNativeModels(): LocalModels {
  return {
    list: () => invoke('models_list'),
    system: () => invoke('system_info'),
    async download(id, onProgress) {
      const channel = new Channel<DownloadProgress>()
      channel.onmessage = onProgress
      try {
        await invoke('model_download', { id, onProgress: channel })
        return { status: 'installed' }
      } catch (cause) {
        const kind = failureKind(cause)
        return kind === 'cancelled' ? { status: 'stopped' } : { status: 'failed', kind }
      }
    },
    stop: (id) => invoke('model_download_cancel', { id }),
    remove: (id) => invoke('model_delete', { id }),
  }
}
