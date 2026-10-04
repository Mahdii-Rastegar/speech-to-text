import { describe, expect, it } from 'vitest'
import { createAppError } from '../errors'
import type { TranscriptSegment } from '../stt/provider'
import {
  INITIAL_RECORDING_STATE,
  isBusy,
  recordingReducer,
  type RecordingEvent,
  type RecordingState,
} from './machine'

const segment = (id: string, text: string): TranscriptSegment => ({
  id,
  text,
  startMs: 0,
  endMs: 1000,
})

const run = (events: RecordingEvent[], from: RecordingState = INITIAL_RECORDING_STATE) =>
  events.reduce(recordingReducer, from)

describe('recordingReducer', () => {
  it('walks through a full recording', () => {
    const state = run([
      { type: 'START_REQUESTED' },
      { type: 'STARTED', at: 1_000 },
      { type: 'INTERIM', text: 'امروز باید' },
      { type: 'FINAL', segment: segment('a', 'امروز باید روی API کار کنم') },
      { type: 'INTERIM', text: 'بعدش' },
      { type: 'STOP_REQUESTED', at: 24_000 },
      { type: 'FINAL', segment: segment('b', 'بعدش تست') },
      { type: 'FINALIZED' },
    ])

    expect(state.phase).toBe('done')
    expect(state.segments.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(state.interim).toBe('')
    expect(state.durationMs).toBe(23_000)
    expect(state.error).toBeNull()
  })

  it('clears interim text when a segment becomes final', () => {
    const state = run([
      { type: 'START_REQUESTED' },
      { type: 'STARTED', at: 0 },
      { type: 'INTERIM', text: 'در حال' },
      { type: 'FINAL', segment: segment('a', 'در حال تست') },
    ])
    expect(state.interim).toBe('')
    expect(state.segments).toHaveLength(1)
  })

  it('keeps the text captured so far when the engine fails', () => {
    const error = createAppError('provider-unavailable')
    const state = run([
      { type: 'START_REQUESTED' },
      { type: 'STARTED', at: 0 },
      { type: 'FINAL', segment: segment('a', 'جمله‌ی اول') },
      { type: 'INTERIM', text: 'جمله‌ی دوم' },
      { type: 'FAILED', error, at: 5_000 },
    ])
    expect(state.phase).toBe('error')
    expect(state.error).toEqual(error)
    expect(state.segments).toHaveLength(1)
    expect(state.interim).toBe('')
    expect(state.durationMs).toBe(5_000)
  })

  it('ignores events that do not belong to the current phase', () => {
    const idle = run([
      { type: 'INTERIM', text: 'x' },
      { type: 'FINAL', segment: segment('a', 'x') },
      { type: 'STOP_REQUESTED', at: 1 },
      { type: 'FINALIZED' },
    ])
    expect(idle).toBe(INITIAL_RECORDING_STATE)

    const done = run([
      { type: 'START_REQUESTED' },
      { type: 'STARTED', at: 0 },
      { type: 'STOP_REQUESTED', at: 10 },
      { type: 'FINALIZED' },
    ])
    expect(recordingReducer(done, { type: 'INTERIM', text: 'late' })).toBe(done)
  })

  it('drops interim updates that arrive after stop was requested', () => {
    const state = run([
      { type: 'START_REQUESTED' },
      { type: 'STARTED', at: 0 },
      { type: 'STOP_REQUESTED', at: 10 },
      { type: 'INTERIM', text: 'late' },
    ])
    expect(state.phase).toBe('finalizing')
    expect(state.interim).toBe('')
  })

  it('starts clean after a finished or failed recording', () => {
    const failed = run([
      { type: 'START_REQUESTED' },
      { type: 'FAILED', error: createAppError('mic-permission-denied'), at: 0 },
    ])
    expect(failed.phase).toBe('error')

    const restarted = recordingReducer(failed, { type: 'START_REQUESTED' })
    expect(restarted.phase).toBe('starting')
    expect(restarted.error).toBeNull()
    expect(restarted.segments).toEqual([])
  })

  it('resets from any phase', () => {
    const recording = run([{ type: 'START_REQUESTED' }, { type: 'STARTED', at: 0 }])
    expect(recordingReducer(recording, { type: 'RESET' })).toBe(INITIAL_RECORDING_STATE)
  })
})

describe('isBusy', () => {
  it('is true only while a recording is in progress', () => {
    expect(isBusy('idle')).toBe(false)
    expect(isBusy('starting')).toBe(true)
    expect(isBusy('recording')).toBe(true)
    expect(isBusy('finalizing')).toBe(true)
    expect(isBusy('done')).toBe(false)
    expect(isBusy('error')).toBe(false)
  })
})
