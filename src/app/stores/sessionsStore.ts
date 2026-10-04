import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { createDemoSessions } from '@/app/demo/demoSessions'
import type { TranscriptionSession } from '@/core/session'

/** Which AI outputs are being produced for a session right now. */
export interface ProcessingParts {
  clean: boolean
  summary: boolean
}

export interface SessionsState {
  /** Newest first. In-memory for now; the History phase adds real persistence. */
  sessions: TranscriptionSession[]
  activeSessionId: string | null
  processing: Record<string, ProcessingParts>
}

export const sessionsStore = createStore<SessionsState>(() => ({
  sessions: createDemoSessions(new Date()),
  activeSessionId: null,
  processing: {},
}))

export function addSession(session: TranscriptionSession): void {
  sessionsStore.setState((state) => ({
    sessions: [session, ...state.sessions],
    activeSessionId: session.id,
  }))
}

export function updateSession(
  id: string,
  update: (session: TranscriptionSession) => Partial<TranscriptionSession>,
): void {
  sessionsStore.setState((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === id ? { ...session, ...update(session) } : session,
    ),
  }))
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
