import { describe, expect, it, vi } from 'vitest'
import { noise, silence } from '../audio/testSignals'
import { createBufferedLiveSession } from './bufferedLive'
import type { LiveEvent, STTProvider, TranscriptionResult } from './provider'

const RATE = 16_000
const OPTIONS = { model: 'large-v3-turbo', language: 'fa' } as const

function batchProvider(result: TranscriptionResult) {
  const transcribe = vi.fn<STTProvider['transcribe']>(async () => result)
  const provider: STTProvider = {
    id: 'batch',
    kind: 'local',
    models: [{ id: 'large-v3-turbo' }],
    getCapabilities: () => ({ mode: 'batch', offline: true, languages: ['fa'], billing: 'none' }),
    validateConfiguration: async () => ({ ok: true }),
    transcribe,
    estimateCost: () => null,
  }
  return { provider, transcribe }
}

const RESULT: TranscriptionResult = {
  segments: [
    { id: 'a', text: 'سلام', startMs: 0, endMs: 900 },
    { id: 'b', text: 'دنیا', startMs: 900, endMs: 1800 },
  ],
  durationMs: 2000,
  cost: null,
}

/** Feeds a signal in blocks of 100 ms, the way the microphone delivers it. */
function feed(session: { pushAudio(samples: Float32Array): void }, signal: Float32Array) {
  const block = RATE / 10
  for (let start = 0; start < signal.length; start += block) {
    session.pushAudio(signal.subarray(start, start + block))
  }
}

describe('buffered live session', () => {
  it('sends the whole recording once, on stop', async () => {
    const { provider, transcribe } = batchProvider(RESULT)
    const session = createBufferedLiveSession(provider, OPTIONS, RATE)
    const events: LiveEvent[] = []
    session.onEvent((event) => events.push(event))

    feed(session, silence(500, RATE))
    feed(session, noise(1000, RATE, 0.2))
    expect(transcribe).not.toHaveBeenCalled()

    const result = await session.stop()
    expect(transcribe).toHaveBeenCalledTimes(1)
    const [audio, options] = transcribe.mock.calls[0]!
    expect(audio.kind === 'pcm' && audio.samples.length).toBe(RATE * 1.5)
    expect(options).toEqual(OPTIONS)
    expect(result).toBe(RESULT)
    expect(events).toEqual(RESULT.segments.map((segment) => ({ type: 'final', segment })))
  })

  it('does not send a recording in which no voice was heard', async () => {
    const { provider, transcribe } = batchProvider(RESULT)
    const session = createBufferedLiveSession(provider, OPTIONS, RATE)
    feed(session, silence(2000, RATE))

    const result = await session.stop()
    expect(transcribe).not.toHaveBeenCalled()
    expect(result).toEqual({ segments: [], durationMs: 2000, cost: null })
  })

  it('transcribes once even if stop is called twice', async () => {
    const { provider, transcribe } = batchProvider(RESULT)
    const session = createBufferedLiveSession(provider, OPTIONS, RATE)
    feed(session, noise(1000, RATE, 0.2))

    expect(session.stop()).toBe(session.stop())
    await session.stop()
    expect(transcribe).toHaveBeenCalledTimes(1)
  })

  it('ignores audio after an abort', async () => {
    const { provider, transcribe } = batchProvider(RESULT)
    const session = createBufferedLiveSession(provider, OPTIONS, RATE)
    session.abort()
    feed(session, noise(1000, RATE, 0.2))

    expect((await session.stop()).segments).toEqual([])
    expect(transcribe).not.toHaveBeenCalled()
  })
})
