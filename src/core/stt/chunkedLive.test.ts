import { describe, expect, it, vi } from 'vitest'
import { concat, noise, silence } from '../audio/testSignals'
import { AppFailure, createAppError } from '../errors'
import { createChunkedLiveSession, type ChunkedLiveConfig } from './chunkedLive'
import type { LiveEvent, STTProvider, TranscribeOptions, TranscriptionResult } from './provider'

const RATE = 16_000
const OPTIONS: TranscribeOptions = { model: 'large-v3-turbo', language: 'fa', prompt: 'Tauri' }

/** An engine that answers every clip with one numbered sentence, as long as the clip. */
function batchProvider(answer?: (call: number) => Promise<TranscriptionResult>) {
  let calls = 0
  const transcribe = vi.fn<STTProvider['transcribe']>(async (audio) => {
    calls += 1
    if (answer) return answer(calls)
    const durationMs = audio.kind === 'pcm' ? (audio.samples.length / RATE) * 1000 : 0
    return {
      segments: [
        { id: 'same-every-time', text: ` جمله ${calls} `, startMs: 100, endMs: durationMs },
      ],
      durationMs,
      cost: { amountUsd: 0.5, estimated: true },
    }
  })
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

function start(config: ChunkedLiveConfig = {}, answer?: Parameters<typeof batchProvider>[0]) {
  const { provider, transcribe } = batchProvider(answer)
  const session = createChunkedLiveSession(provider, OPTIONS, RATE, {
    interimEveryMs: null,
    ...config,
  })
  const events: LiveEvent[] = []
  session.onEvent((event) => events.push(event))
  return { session, transcribe, events }
}

/** Feeds a signal in blocks of 64 ms, the way the microphone delivers it. */
function feed(session: { pushAudio(samples: Float32Array): void }, signal: Float32Array) {
  const block = 1024
  for (let offset = 0; offset < signal.length; offset += block) {
    session.pushAudio(signal.subarray(offset, offset + block))
  }
}

/** Lets the requests that are already queued run to their end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const speech = (ms: number) => noise(ms, RATE, 0.2)
const clipMs = (call: Parameters<STTProvider['transcribe']>) =>
  call[0].kind === 'pcm' ? (call[0].samples.length / RATE) * 1000 : 0
const finals = (events: LiveEvent[]) =>
  events.flatMap((event) => (event.type === 'final' ? [event.segment] : []))

describe('chunked live session', () => {
  it('sends a sentence as soon as the speaker pauses, while the recording goes on', async () => {
    const { session, transcribe, events } = start()
    feed(session, concat(silence(1000, RATE), speech(2000), silence(1000, RATE)))
    await settle()

    expect(transcribe).toHaveBeenCalledTimes(1)
    // The voice, a little audio from before it, and the pause that ended it.
    const length = clipMs(transcribe.mock.calls[0]!)
    expect(length).toBeGreaterThan(2400)
    expect(length).toBeLessThan(3200)
    expect(finals(events)).toHaveLength(1)

    feed(session, concat(speech(1500), silence(300, RATE)))
    const result = await session.stop()
    expect(transcribe).toHaveBeenCalledTimes(2)
    expect(result.segments.map((segment) => segment.text)).toEqual(['جمله 1', 'جمله 2'])
    expect(result.durationMs).toBeCloseTo(5800, -2)
    expect(result.cost).toEqual({ amountUsd: 1, estimated: true })
  })

  it('places every piece on the timeline of the whole recording, with its own id', async () => {
    const { session } = start()
    feed(session, concat(silence(1000, RATE), speech(1500), silence(2000, RATE), speech(1500)))
    const { segments } = await session.stop()

    expect(new Set(segments.map((segment) => segment.id)).size).toBe(2)
    expect(segments[0]!.startMs).toBeGreaterThan(700)
    expect(segments[0]!.startMs).toBeLessThan(1200)
    expect(segments[1]!.startMs).toBeGreaterThan(4200)
    expect(segments[1]!.endMs).toBeLessThanOrEqual(6100)
  })

  it('never sends silence or a short click', async () => {
    const { session, transcribe } = start()
    feed(session, concat(silence(2000, RATE), speech(80), silence(2000, RATE)))

    const result = await session.stop()
    expect(transcribe).not.toHaveBeenCalled()
    expect(result).toEqual({ segments: [], durationMs: 4080, cost: null })
  })

  it('pads a very short word so the engine gets a clip it can read', async () => {
    const { session, transcribe } = start()
    feed(session, concat(silence(500, RATE), speech(300), silence(100, RATE)))
    await session.stop()

    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(clipMs(transcribe.mock.calls[0]!)).toBeGreaterThanOrEqual(1000)
  })

  it('cuts speech that never pauses before it outgrows what the engine reads', async () => {
    const { session, transcribe } = start({ softMaxMs: 3000, hardMaxMs: 5000 })
    feed(session, speech(12_000))
    await session.stop()

    expect(transcribe).toHaveBeenCalledTimes(3)
    for (const call of transcribe.mock.calls) expect(clipMs(call)).toBeLessThanOrEqual(5100)
  })

  it('ends a long sentence at the next breath', async () => {
    const { session, transcribe } = start({ softMaxMs: 3000 })
    // A 350 ms gap is too short to end a sentence, unless the sentence is already long.
    feed(session, concat(speech(1000), silence(350, RATE), speech(2500), silence(350, RATE)))
    feed(session, speech(1000))
    await settle()

    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(clipMs(transcribe.mock.calls[0]!)).toBeGreaterThan(3800)
    await session.stop()
    expect(transcribe).toHaveBeenCalledTimes(2)
  })

  it('shows the sentence in progress as interim text, then replaces it with the final one', async () => {
    const { session, transcribe, events } = start({ interimEveryMs: 1000 })
    feed(session, speech(1200))
    await settle()
    feed(session, speech(1200))
    await settle()
    expect(events).toEqual([
      { type: 'interim', text: 'جمله 1' },
      { type: 'interim', text: 'جمله 2' },
    ])
    // The second look covers the sentence from its start, not only the new part.
    expect(clipMs(transcribe.mock.calls[1]!)).toBeGreaterThan(2000)

    const result = await session.stop()
    expect(result.segments.map((segment) => segment.text)).toEqual(['جمله 3'])
    expect(events.at(-1)).toMatchObject({ type: 'final' })
  })

  it('does not stack interim requests while the engine is still busy', async () => {
    let release = () => {}
    const { session, transcribe } = start({ interimEveryMs: 500 }, async () => {
      await new Promise<void>((resolve) => (release = resolve))
      return { segments: [], durationMs: 0, cost: null }
    })
    feed(session, speech(4000))
    await settle()
    expect(transcribe).toHaveBeenCalledTimes(1)

    release()
    const stopped = session.stop()
    await settle()
    release()
    await stopped
    expect(transcribe).toHaveBeenCalledTimes(2)
  })

  it('joins the pieces that pile up behind a busy engine into one request', async () => {
    let release = () => {}
    const { session, transcribe } = start({}, async () => {
      await new Promise<void>((resolve) => (release = resolve))
      return { segments: [], durationMs: 0, cost: null }
    })
    const sentence = concat(speech(1500), silence(1500, RATE))
    feed(session, concat(sentence, sentence, sentence))
    await settle()
    expect(transcribe).toHaveBeenCalledTimes(1)

    release()
    const stopped = session.stop()
    await settle()
    release()
    await stopped
    expect(transcribe).toHaveBeenCalledTimes(2)
    expect(clipMs(transcribe.mock.calls[1]!)).toBeGreaterThan(4000)
  })

  it('gives up interim text when the engine is too slow to keep up', async () => {
    const clock = vi.spyOn(Date, 'now')
    let now = 0
    clock.mockImplementation(() => now)
    const { session, transcribe } = start({ interimEveryMs: 1000 }, async () => {
      now += 20_000
      return { segments: [], durationMs: 0, cost: null }
    })
    feed(session, speech(1200))
    await settle()
    feed(session, speech(3000))
    await settle()
    expect(transcribe).toHaveBeenCalledTimes(1)

    await session.stop()
    expect(transcribe).toHaveBeenCalledTimes(2)
    clock.mockRestore()
  })

  it('passes the glossary and the text so far as context', async () => {
    const { session, transcribe } = start()
    feed(session, concat(speech(1500), silence(1500, RATE), speech(1500)))
    await session.stop()

    expect(transcribe.mock.calls[0]![1].prompt).toBe('Tauri')
    expect(transcribe.mock.calls[1]![1].prompt).toBe('Tauri جمله 1')
  })

  it('reports an engine failure as an event and rejects the stop', async () => {
    const failure = new AppFailure(createAppError('provider-unavailable'))
    const { session, transcribe, events } = start({}, async () => {
      throw failure
    })
    feed(session, concat(speech(1500), silence(1500, RATE), speech(1500)))
    await settle()
    expect(events).toEqual([{ type: 'error', error: failure.appError }])

    await expect(session.stop()).rejects.toBe(failure)
    // Nothing more is sent to an engine that has already failed.
    expect(transcribe).toHaveBeenCalledTimes(1)
  })

  it('transcribes once even if stop is called twice', async () => {
    const { session, transcribe } = start()
    feed(session, speech(1000))

    expect(session.stop()).toBe(session.stop())
    await session.stop()
    expect(transcribe).toHaveBeenCalledTimes(1)
  })

  it('ignores audio after an abort and stays silent', async () => {
    const { session, transcribe, events } = start()
    feed(session, speech(1000))
    session.abort()
    feed(session, speech(1000))

    expect((await session.stop()).segments).toEqual([])
    expect(transcribe).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })
})
