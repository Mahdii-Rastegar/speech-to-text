import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  INITIAL_RECORDING_STATE,
  recordingReducer,
  type RecordingEvent,
  type RecordingState,
} from '@/core/recording/machine'

export const recordingStore = createStore<RecordingState>(() => INITIAL_RECORDING_STATE)

export function dispatchRecording(event: RecordingEvent): void {
  recordingStore.setState(recordingReducer(recordingStore.getState(), event), true)
}

export function useRecording<T>(selector: (state: RecordingState) => T): T {
  return useStore(recordingStore, selector)
}
