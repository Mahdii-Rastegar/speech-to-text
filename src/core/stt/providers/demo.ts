import { createVad } from '../../audio/vad'
import { createAppError } from '../../errors'
import type { CostInfo } from '../../session'
import { delay } from '../../util/delay'
import type {
  LiveEvent,
  LiveSession,
  ModelInfo,
  ProviderKind,
  STTProvider,
  TranscriptSegment,
  TranscriptionResult,
} from '../provider'
import { DEMO_SCRIPT } from './demoScript'

export interface DemoProviderOptions {
  id: string
  kind: ProviderKind
  models: readonly ModelInfo[]
  /** List price shown for the cloud-styled demo engine. Null means free (local). */
  usdPerAudioSecond: number | null
  /** Fail every live session this long after it starts, to preview the error state. */
  failAfterMs?: number
  firstWordDelayMs?: number
  wordIntervalMs?: number
  sentencePauseMs?: number
  finalizeDelayMs?: number
}

/** The rate of the audio a live session is fed. */
const AUDIO_SAMPLE_RATE = 16_000

/**
 * An engine that needs no model or network: it plays a script back as interim
 * and final text. It exists so the interface and the recording flow can be
 * built and tested before any real engine is wired in.
 *
 * Fed with audio, it does not recognize anything, but it keeps the speaker's
 * pace: words appear only while a voice is heard, and a pause closes the
 * sentence so far, the way a real chunking engine will.
 */
export function createDemoProvider(options: DemoProviderOptions): STTProvider {
  const {
    id,
    kind,
    models,
    usdPerAudioSecond,
    failAfterMs,
    firstWordDelayMs = 500,
    wordIntervalMs = 170,
    sentencePauseMs = 450,
    finalizeDelayMs = 350,
  } = options

  const estimateCost = (audioSeconds: number): CostInfo | null =>
    usdPerAudioSecond === null
      ? null
      : { amountUsd: audioSeconds * usdPerAudioSecond, estimated: true }

  function transcribeStream(): LiveSession {
    const listeners = new Set<(event: LiveEvent) => void>()
    const segments: TranscriptSegment[] = []
    const startedAt = Date.now()
    let lineIndex = 0
    let words = wordsOfLine(lineIndex)
    let wordCount = 0
    let segmentStartMs = firstWordDelayMs
    let wordTimer: ReturnType<typeof setTimeout> | undefined
    let failTimer: ReturnType<typeof setTimeout> | undefined
    let closed = false
    let stopping: Promise<TranscriptionResult> | undefined
    const vad = createVad({ sampleRate: AUDIO_SAMPLE_RATE })
    /** Set by the first audio; without any, the script runs on its own clock. */
    let pacedByVoice = false

    const emit = (event: LiveEvent) => listeners.forEach((listener) => listener(event))
    const elapsed = () => Date.now() - startedAt

    const finalizeSpokenWords = () => {
      if (wordCount === 0) return
      const segment: TranscriptSegment = {
        id: `${id}-${segments.length + 1}`,
        text: words.slice(0, wordCount).join(' '),
        startMs: segmentStartMs,
        endMs: elapsed(),
      }
      segments.push(segment)
      wordCount = 0
      emit({ type: 'final', segment })
    }

    const nextLine = () => {
      lineIndex = (lineIndex + 1) % DEMO_SCRIPT.length
      words = wordsOfLine(lineIndex)
    }

    const speakNextWord = () => {
      if (closed) return
      if (pacedByVoice && !vad.speaking) {
        wordTimer = setTimeout(speakNextWord, wordIntervalMs)
        return
      }
      wordCount += 1
      if (wordCount < words.length) {
        emit({ type: 'interim', text: words.slice(0, wordCount).join(' ') })
        wordTimer = setTimeout(speakNextWord, wordIntervalMs)
        return
      }
      finalizeSpokenWords()
      nextLine()
      segmentStartMs = elapsed() + sentencePauseMs
      wordTimer = setTimeout(speakNextWord, sentencePauseMs + wordIntervalMs)
    }

    /** The speaker paused: what was said so far becomes final, and the line carries on after it. */
    const endPhrase = () => {
      if (wordCount === 0) return
      const rest = words.slice(wordCount)
      finalizeSpokenWords()
      if (rest.length > 0) words = rest
      else nextLine()
      segmentStartMs = elapsed()
    }

    const close = () => {
      closed = true
      clearTimeout(wordTimer)
      clearTimeout(failTimer)
    }

    wordTimer = setTimeout(speakNextWord, firstWordDelayMs)
    if (failAfterMs !== undefined) {
      failTimer = setTimeout(() => {
        if (closed) return
        close()
        emit({
          type: 'error',
          error: createAppError('provider-unavailable', 'Simulated failure of the demo engine'),
        })
      }, failAfterMs)
    }

    return {
      pushAudio(samples) {
        if (closed) return
        pacedByVoice = true
        for (const event of vad.process(samples)) {
          if (event.type === 'speech-end') endPhrase()
        }
      },
      onEvent(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      stop() {
        if (stopping) return stopping
        close()
        const durationMs = elapsed()
        stopping = delay(finalizeDelayMs).then(() => {
          finalizeSpokenWords()
          return { segments: [...segments], durationMs, cost: estimateCost(durationMs / 1000) }
        })
        return stopping
      },
      abort() {
        close()
        listeners.clear()
      },
    }
  }

  return {
    id,
    kind,
    models,
    getCapabilities: () => ({
      mode: 'streaming',
      offline: kind === 'local',
      languages: ['auto', 'fa', 'en'],
      billing: usdPerAudioSecond === null ? 'none' : 'per-audio-second',
    }),
    validateConfiguration: async () => ({ ok: true }),
    async transcribe(audio, _options, signal) {
      const durationMs =
        audio.kind === 'pcm'
          ? Math.round((audio.samples.length / audio.sampleRate) * 1000)
          : DEMO_SCRIPT.length * 4000
      await delay(600, signal)
      const perLine = durationMs / DEMO_SCRIPT.length
      const segments = DEMO_SCRIPT.map((line, index) => ({
        id: `${id}-${index + 1}`,
        text: line.raw,
        startMs: Math.round(index * perLine),
        endMs: Math.round((index + 1) * perLine),
      }))
      return { segments, durationMs, cost: estimateCost(durationMs / 1000) }
    },
    transcribeStream,
    estimateCost,
  }
}

function wordsOfLine(index: number): string[] {
  return (DEMO_SCRIPT[index]?.raw ?? '').split(' ')
}
