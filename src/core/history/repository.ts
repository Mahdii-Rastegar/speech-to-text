import type { CostInfo, LanguageSetting, TranscriptionSession } from '../session'

/**
 * Where sessions are kept between runs: a database file beside the desktop
 * app, the browser's own storage on the web. Only text and metadata go in.
 */
export interface HistoryRepository {
  /** Every stored session, newest first. Entries that cannot be read are left out. */
  list(): Promise<TranscriptionSession[]>
  /** Adds the session, or replaces the stored one with the same id. */
  save(session: TranscriptionSession): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

const LANGUAGES: readonly LanguageSetting[] = ['auto', 'fa', 'en']

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)

function costOf(value: unknown): CostInfo | null {
  const { amountUsd, estimated } = (typeof value === 'object' && value !== null ? value : {}) as {
    amountUsd?: unknown
    estimated?: unknown
  }
  if (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd)) return null
  return { amountUsd, estimated: estimated !== false }
}

/**
 * Reads one stored entry. Storage outlives the code that wrote it and can be
 * edited by hand, so every field is checked: an entry without an id, a valid
 * date or any text is dropped, and anything else that is missing gets a default.
 */
export function parseStoredSession(value: unknown): TranscriptionSession | null {
  if (typeof value !== 'object' || value === null) return null
  const stored = value as Record<string, unknown>

  const { id, createdAt, rawTranscript } = stored
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return null
  if (typeof rawTranscript !== 'string' || rawTranscript.length === 0) return null

  const updatedAt = stored.updatedAt
  const durationMs = stored.durationMs
  return {
    id,
    createdAt,
    updatedAt:
      typeof updatedAt === 'string' && !Number.isNaN(Date.parse(updatedAt)) ? updatedAt : createdAt,
    durationMs: typeof durationMs === 'number' && durationMs >= 0 ? durationMs : 0,
    language: LANGUAGES.find((language) => language === stored.language) ?? 'auto',
    source: stored.source === 'file' ? 'file' : 'microphone',
    provider: textOrNull(stored.provider) ?? '',
    model: textOrNull(stored.model) ?? '',
    title: textOrNull(stored.title),
    rawTranscript,
    cleanTranscript: textOrNull(stored.cleanTranscript),
    summary: textOrNull(stored.summary),
    cost: costOf(stored.cost),
    // Whatever was going on when it was written is over by the time it is read back.
    status: 'done',
  }
}

export function newestFirst(sessions: TranscriptionSession[]): TranscriptionSession[] {
  return [...sessions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/** History that lives only as long as the app is open: for tests, and when storage is unavailable. */
export function createMemoryHistory(initial: TranscriptionSession[] = []): HistoryRepository {
  const sessions = new Map(initial.map((session) => [session.id, session]))
  return {
    list: async () => newestFirst([...sessions.values()]),
    async save(session) {
      sessions.set(session.id, session)
    },
    async remove(id) {
      sessions.delete(id)
    },
    async clear() {
      sessions.clear()
    },
  }
}
