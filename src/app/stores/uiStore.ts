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

export interface UiState {
  /** Which version of the transcript is on screen. */
  version: TranscriptVersion
  /** History drawer on small screens. */
  railOpen: boolean
  notice: { id: number; kind: NoticeKind } | null
}

export const uiStore = createStore<UiState>(() => ({
  version: 'raw',
  railOpen: false,
  notice: null,
}))

let noticeCounter = 0

export function notify(kind: NoticeKind): void {
  noticeCounter += 1
  uiStore.setState({ notice: { id: noticeCounter, kind } })
}

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector)
}
