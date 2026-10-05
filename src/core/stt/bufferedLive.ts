import { concatSamples } from '../audio/pcm'
import { createVad } from '../audio/vad'
import type {
  LiveEvent,
  LiveSession,
  STTProvider,
  TranscribeOptions,
  TranscriptionResult,
} from './provider'

/**
 * Recording session for engines that take a whole recording at once: the
 * audio is kept in memory while recording and sent in a single request on
 * stop, so the text arrives after the recording ends. The audio is dropped
 * as soon as the text is back.
 */
export function createBufferedLiveSession(
  provider: STTProvider,
  options: TranscribeOptions,
  sampleRate: number,
): LiveSession {
  const listeners = new Set<(event: LiveEvent) => void>()
  const cancel = new AbortController()
  const vad = createVad({ sampleRate })
  let blocks: Float32Array[] = []
  let heardVoice = false
  let closed = false
  let stopping: Promise<TranscriptionResult> | undefined

  const transcribe = async (): Promise<TranscriptionResult> => {
    const samples = concatSamples(blocks)
    blocks = []
    const durationMs = Math.round((samples.length / sampleRate) * 1000)
    // Whisper invents sentences when it is given silence, so silence is never sent.
    if (!heardVoice) return { segments: [], durationMs, cost: null }

    const result = await provider.transcribe(
      { kind: 'pcm', sampleRate, samples },
      options,
      cancel.signal,
    )
    for (const segment of result.segments) {
      listeners.forEach((listener) => listener({ type: 'final', segment }))
    }
    return result
  }

  return {
    pushAudio(samples) {
      if (closed) return
      blocks.push(samples.slice())
      if (vad.process(samples).some((event) => event.type === 'speech-start')) heardVoice = true
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    stop() {
      closed = true
      stopping ??= transcribe()
      return stopping
    },
    abort() {
      closed = true
      blocks = []
      cancel.abort()
      listeners.clear()
    },
  }
}
