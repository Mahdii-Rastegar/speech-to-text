import type { AppError } from '../errors'
import type { TranscriptSegment } from '../stt/provider'

export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'finalizing' | 'done' | 'error'

export interface RecordingState {
  phase: RecordingPhase
  /** Final text, in order. Append-only while a recording is running. */
  segments: readonly TranscriptSegment[]
  /** Text that is still being recognized and may change. */
  interim: string
  /** Epoch milliseconds when capture actually began. */
  startedAt: number | null
  /** Length of the recording. Set when it stops or fails. */
  durationMs: number
  error: AppError | null
}

export type RecordingEvent =
  | { type: 'START_REQUESTED' }
  | { type: 'STARTED'; at: number }
  | { type: 'INTERIM'; text: string }
  | { type: 'FINAL'; segment: TranscriptSegment }
  | { type: 'STOP_REQUESTED'; at: number }
  | { type: 'FINALIZED' }
  | { type: 'FAILED'; error: AppError; at: number }
  | { type: 'RESET' }

export const INITIAL_RECORDING_STATE: RecordingState = {
  phase: 'idle',
  segments: [],
  interim: '',
  startedAt: null,
  durationMs: 0,
  error: null,
}

const elapsedSince = (startedAt: number | null, at: number) =>
  startedAt === null ? 0 : Math.max(0, at - startedAt)

/**
 * Pure state machine for one recording. Events that make no sense in the
 * current phase are ignored, so late engine callbacks cannot corrupt the state.
 */
export function recordingReducer(state: RecordingState, event: RecordingEvent): RecordingState {
  if (event.type === 'RESET') return INITIAL_RECORDING_STATE

  switch (state.phase) {
    case 'idle':
    case 'done':
    case 'error':
      if (event.type === 'START_REQUESTED') {
        return { ...INITIAL_RECORDING_STATE, phase: 'starting' }
      }
      return state

    case 'starting':
      if (event.type === 'STARTED') return { ...state, phase: 'recording', startedAt: event.at }
      if (event.type === 'FAILED') return { ...state, phase: 'error', error: event.error }
      return state

    case 'recording':
      switch (event.type) {
        case 'INTERIM':
          return event.text === state.interim ? state : { ...state, interim: event.text }
        case 'FINAL':
          return { ...state, segments: [...state.segments, event.segment], interim: '' }
        case 'STOP_REQUESTED':
          return {
            ...state,
            phase: 'finalizing',
            durationMs: elapsedSince(state.startedAt, event.at),
          }
        case 'FAILED':
          return {
            ...state,
            phase: 'error',
            interim: '',
            error: event.error,
            durationMs: elapsedSince(state.startedAt, event.at),
          }
        default:
          return state
      }

    case 'finalizing':
      switch (event.type) {
        case 'FINAL':
          return { ...state, segments: [...state.segments, event.segment], interim: '' }
        case 'FINALIZED':
          return { ...state, phase: 'done', interim: '' }
        case 'FAILED':
          return { ...state, phase: 'error', interim: '', error: event.error }
        default:
          return state
      }
  }
}

export function isCapturing(phase: RecordingPhase): boolean {
  return phase === 'starting' || phase === 'recording'
}

export function isBusy(phase: RecordingPhase): boolean {
  return phase === 'starting' || phase === 'recording' || phase === 'finalizing'
}
