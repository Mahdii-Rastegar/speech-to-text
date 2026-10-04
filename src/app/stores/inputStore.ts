import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/** What the microphone is hearing right now, while a recording is running. */
export interface InputState {
  /** Voice is being heard, as opposed to a pause or a quiet room. */
  speaking: boolean
  /** Nothing at all is arriving: the microphone is probably muted. */
  noSignal: boolean
}

const QUIET: InputState = { speaking: false, noSignal: false }

export const inputStore = createStore<InputState>(() => QUIET)

export function resetInput(): void {
  inputStore.setState(QUIET, true)
}

export function useInput<T>(selector: (state: InputState) => T): T {
  return useStore(inputStore, selector)
}
