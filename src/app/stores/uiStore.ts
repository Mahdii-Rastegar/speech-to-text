import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { AppErrorKind } from '@/core/errors'
import type { TranscriptVersion } from '@/core/session'

/** Short messages for the user. The interface layer turns each kind into text. */
export type NoticeKind =
  | 'recording-started'
  | 'recording-started-slow'
  | 'recording-stopped'
  | 'nothing-recorded'
  | 'copied'
  | 'copy-failed'
  | 'ai-finished'
  | 'ai-failed'
  | 'file-finished'
  | 'file-no-speech'
  | 'file-cancelled'
  | 'history-unavailable'
  | 'session-deleted'
  | 'history-cleared'
  | 'key-not-saved'
  | 'key-saved'
  | 'key-save-failed'
  | 'key-deleted'
  | 'model-installed'
  | 'model-deleted'
  | 'model-delete-failed'
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
  /** `reason` is the failure behind the notice, when it has one worth telling. */
  notice: { id: number; kind: NoticeKind; reason?: AppErrorKind } | null
}

export const uiStore = createStore<UiState>(() => ({
  view: 'main',
  version: 'raw',
  railOpen: false,
  notice: null,
}))

let noticeCounter = 0

export function notify(kind: NoticeKind, reason?: AppErrorKind): void {
  noticeCounter += 1
  uiStore.setState({ notice: { id: noticeCounter, kind, ...(reason && { reason }) } })
}

export function openView(view: View): void {
  uiStore.setState({ view, railOpen: false })
}

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector)
}
