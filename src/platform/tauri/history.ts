import { invoke } from '@tauri-apps/api/core'
import { parseStoredSession, type HistoryRepository } from '@/core/history/repository'
import type { TranscriptionSession } from '@/core/session'

function parseBody(body: string): TranscriptionSession | null {
  try {
    return parseStoredSession(JSON.parse(body))
  } catch {
    return null
  }
}

/**
 * History in the desktop app: a SQLite file in the app's `data` folder, kept
 * by the native side. Each session travels as JSON text, so the native side
 * needs to know only its id and date.
 */
export function createNativeHistory(): HistoryRepository {
  return {
    async list() {
      const bodies = await invoke<string[]>('history_list')
      return bodies.map(parseBody).filter((session) => session !== null)
    },
    async save(session) {
      await invoke('history_save', {
        id: session.id,
        createdAt: session.createdAt,
        body: JSON.stringify(session),
      })
    },
    async remove(id) {
      await invoke('history_delete', { id })
    },
    async clear() {
      await invoke('history_clear')
    },
  }
}
