import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { TranscriptVersion } from '@/core/session'

/** Short messages for the user. The interface layer turns each kind into text. */
export type NoticeKind =
  | 'recording-started'
  | 'recording-stopped'
  | 'nothing-recorded'
  | 'copied'
  | 'copy-failed'
  | 'ai-finished'
  | 'ai-failed'
  | 'coming-soon'
  | 'session-deleted'
  | 'history-cleared'
  | 'key-not-saved'
  | 'mic-no-signal'
  | 'mic-fell-back'

/** Screens switch by state, never by URL. */
export type View = 'main' | 'history' | 'settings'

export interface UiState {
  view: View
  /** Which version of the transcript is on screen. */
  version: TranscriptVersion
  /** History drawer on small screens. */
  railOpen: boolean
  notice: { id: number; kind: NoticeKind } | null
}

export const uiStore = createStore<UiState>(() => ({
  view: 'main',
  version: 'raw',
  railOpen: false,
  notice: null,
}))

let noticeCounter = 0

export function notify(kind: NoticeKind): void {
  noticeCounter += 1
  uiStore.setState({ notice: { id: noticeCounter, kind } })
}

export function openView(view: View): void {
  uiStore.setState({ view, railOpen: false })
}

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector)
}
