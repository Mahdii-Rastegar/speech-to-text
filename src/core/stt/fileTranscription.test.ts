import { describe, expect, it, vi } from 'vitest'
import { concat, noise, silence } from '../audio/testSignals'
import { planPieces, transcribeRecording } from './fileTranscription'
import type { STTProvider, TranscribeOptions, TranscriptSegment } from './provider'

const RATE = 16_000
const OPTIONS: TranscribeOptions = { model: 'large-v3-turbo', language: 'fa', prompt: 'Tauri' }

const speech = (ms: number) => noise(ms, RATE, 0.2)
const toMs = (samples: number) => (samples / RATE) * 1000

/** An engine that answers every clip with one numbered sentence, as long as the clip. */
function batchProvider() {
  let calls = 0
  const transcribe = vi.fn<STTProvider['transcribe']>(async (audio) => {
    calls += 1
    const durationMs = audio.kind === 'pcm' ? toMs(audio.samples.length) : 0
    return {
      segments: [{ id: 'same-every-time', text: ` جمله ${calls} `, startMs: 0, endMs: durationMs }],
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

describe('planPieces', () => {
  it('finds nothing to send in silence', () => {
    expect(planPieces(silence(10_000, RATE), RATE)).toEqual([])
  })

  it('leaves out a sound too short to be speech', () => {
    const signal = concat(silence(2000, RATE), speech(100), silence(2000, RATE))
    expect(planPieces(signal, RATE)).toEqual([])
  })

  it('joins sentences into one piece while they fit, and cuts in a pause when they do not', () => {
    const sentence = concat(speech(4000), silence(1000, RATE))
    const signal = concat(silence(500, RATE), ...Array.from({ length: 8 }, () => sentence))

    const [whole] = planPieces(signal, RATE, 60_000)
    expect(toMs(whole?.start ?? 0)).toBeCloseTo(500, -2)
    expect(toMs(whole?.end ?? 0)).toBeCloseTo(39_500, -2)

    const pieces = planPieces(signal, RATE, 12_000)
    expect(pieces).toHaveLength(4)
    for (const piece of pieces) {
      expect(toMs(piece.end - piece.start)).toBeLessThanOrEqual(12_000)
      // Two sentences each: every cut fell in the second between them.
      expect(toMs(piece.end - piece.start)).toBeCloseTo(9000, -2)
    }
  })

  it('cuts endless talk at its quietest moment', () => {
    const signal = concat(speech(7000), noise(400, RATE, 0.02), speech(8000))
    const pieces = planPieces(signal, RATE, 10_000)

    expect(pieces).toHaveLength(2)
    const cut = toMs(pieces[0]?.end ?? 0)
    expect(cut).toBeGreaterThan(7000)
    expect(cut).toBeLessThan(7400)
    expect(pieces[1]?.start).toBe(pieces[0]?.end)
  })
})

describe('transcribeRecording', () => {
  const sentence = concat(speech(4000), silence(1000, RATE))
  const signal = concat(silence(60_000, RATE), ...Array.from({ length: 12 }, () => sentence))

  it('sends only the voiced parts and puts the text on the recording’s own clock', async () => {
    const { provider, transcribe } = batchProvider()
    const result = await transcribeRecording(provider, signal, RATE, OPTIONS)

    // A minute of silence, then a minute of speech: three requests of at most 25 seconds.
    expect(transcribe).toHaveBeenCalledTimes(3)
    expect(result.durationMs).toBe(120_000)
    expect(result.segments.map((segment) => segment.text)).toEqual(['جمله 1', 'جمله 2', 'جمله 3'])
    expect(new Set(result.segments.map((segment) => segment.id)).size).toBe(3)
    expect(result.segments[0]?.startMs).toBeGreaterThan(59_000)
    expect(result.segments[0]?.startMs).toBeLessThan(60_100)
    expect(result.segments[2]?.endMs).toBeLessThanOrEqual(120_000)
    expect(result.cost).toEqual({ amountUsd: 1.5, estimated: true })
  })

  it('hands the engine the glossary and the text so far', async () => {
    const { provider, transcribe } = batchProvider()
    await transcribeRecording(provider, signal, RATE, OPTIONS)

    expect(transcribe.mock.calls[0]?.[1].prompt).toBe('Tauri')
    expect(transcribe.mock.calls[2]?.[1].prompt).toBe('Tauri جمله 1 جمله 2')
  })

  it('reports text and progress piece by piece', async () => {
    const { provider } = batchProvider()
    const heard: TranscriptSegment[] = []
    const progress: number[] = []
    await transcribeRecording(provider, signal, RATE, OPTIONS, {
      onSegment: (segment) => heard.push(segment),
      onProgress: (fraction) => progress.push(fraction),
    })

    expect(heard).toHaveLength(3)
    expect(progress).toHaveLength(4)
    expect(progress.at(-1)).toBe(1)
    expect([...progress].sort((a, b) => a - b)).toEqual(progress)
    expect(progress[0]).toBeGreaterThan(0.5)
  })

  it('stops between two pieces when it is cancelled', async () => {
    const { provider, transcribe } = batchProvider()
    const cancel = new AbortController()
    const heard: TranscriptSegment[] = []
    const run = transcribeRecording(
      provider,
      signal,
      RATE,
      OPTIONS,
      {
        onSegment: (segment) => {
          heard.push(segment)
          cancel.abort()
        },
      },
      cancel.signal,
    )

    await expect(run).rejects.toThrow()
    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(heard).toHaveLength(1)
  })

  it('returns no text for a silent recording without asking the engine', async () => {
    const { provider, transcribe } = batchProvider()
    const progress: number[] = []
    const result = await transcribeRecording(provider, silence(5000, RATE), RATE, OPTIONS, {
      onProgress: (fraction) => progress.push(fraction),
    })

    expect(transcribe).not.toHaveBeenCalled()
    expect(result.segments).toEqual([])
    expect(progress).toEqual([1])
  })
})
