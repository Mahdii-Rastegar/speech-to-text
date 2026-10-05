import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { DEMO_HISTORY_SEEDED_KEY } from '@/app/config'
import { createDemoSessions } from '@/app/demo/demoSessions'
import { history, SEEDS_DEMO_HISTORY } from '@/app/services'
import type { TranscriptionSession } from '@/core/session'
import { notify } from './uiStore'

/** Which AI outputs are being produced for a session right now. */
export interface ProcessingParts {
  clean: boolean
  summary: boolean
}

export interface SessionsState {
  /** Newest first. Every change is also written to the History storage. */
  sessions: TranscriptionSession[]
  /** False until the stored sessions have been read at startup. */
  loaded: boolean
  activeSessionId: string | null
  processing: Record<string, ProcessingParts>
}

export const sessionsStore = createStore<SessionsState>(() => ({
  sessions: [],
  loaded: false,
  activeSessionId: null,
  processing: {},
}))

let warned = false

/** Storage trouble never interrupts the work: the session stays on screen and the user is told once. */
function persist(write: Promise<void>): void {
  write.catch(() => {
    if (!warned) notify('history-unavailable')
    warned = true
  })
}

/** Sample sessions for the demo, written once so that deleting them lasts. */
async function seedDemoSessions(): Promise<TranscriptionSession[]> {
  try {
    if (localStorage.getItem(DEMO_HISTORY_SEEDED_KEY) !== null) return []
    localStorage.setItem(DEMO_HISTORY_SEEDED_KEY, '1')
  } catch {
    return []
  }
  const samples = createDemoSessions(new Date())
  await Promise.all(samples.map((session) => history.save(session)))
  return samples
}

/** Reads the stored sessions at startup. Sessions made in the meantime stay on top. */
export async function loadHistory(): Promise<void> {
  let stored: TranscriptionSession[] = []
  try {
    stored = await history.list()
    if (stored.length === 0 && SEEDS_DEMO_HISTORY) stored = await seedDemoSessions()
  } catch {
    notify('history-unavailable')
    warned = true
  }
  sessionsStore.setState((state) => {
    const fresh = new Set(state.sessions.map((session) => session.id))
    return {
      sessions: [...state.sessions, ...stored.filter((session) => !fresh.has(session.id))],
      loaded: true,
    }
  })
}

export function addSession(session: TranscriptionSession): void {
  sessionsStore.setState((state) => ({
    sessions: [session, ...state.sessions],
    activeSessionId: session.id,
  }))
  persist(history.save(session))
}

export function updateSession(
  id: string,
  update: (session: TranscriptionSession) => Partial<TranscriptionSession>,
): void {
  const current = findSession(id)
  if (!current) return
  const patch = update(current)
  const next = { ...current, ...patch }
  sessionsStore.setState((state) => ({
    sessions: state.sessions.map((session) => (session.id === id ? next : session)),
  }))
  // The status only says what is happening right now; it is not worth a write by itself.
  if (Object.keys(patch).some((key) => key !== 'status')) persist(history.save(next))
}

export function removeSession(id: string): void {
  sessionsStore.setState((state) => ({
    sessions: state.sessions.filter((session) => session.id !== id),
    activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
  }))
  persist(history.remove(id))
}

export function clearSessions(): void {
  sessionsStore.setState({ sessions: [], activeSessionId: null })
  persist(history.clear())
}

export function setProcessing(id: string, parts: ProcessingParts | null): void {
  sessionsStore.setState((state) => {
    const processing = { ...state.processing }
    if (parts) processing[id] = parts
    else delete processing[id]
    return { processing }
  })
}

export function findSession(id: string | null): TranscriptionSession | undefined {
  return id === null
    ? undefined
    : sessionsStore.getState().sessions.find((session) => session.id === id)
}

export function useSessions<T>(selector: (state: SessionsState) => T): T {
  return useStore(sessionsStore, selector)
}
