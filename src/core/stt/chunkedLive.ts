import { concatSamples } from '../audio/pcm'
import { createVad } from '../audio/vad'
import { toAppError } from '../errors'
import { addCosts, type CostInfo } from '../session'
import type {
  LiveEvent,
  LiveSession,
  STTProvider,
  TranscribeOptions,
  TranscriptSegment,
  TranscriptionResult,
} from './provider'

export interface ChunkedLiveConfig {
  /**
   * While a sentence is still being spoken, transcribe what there is of it this
   * often and show the result as interim text. Null turns that off, for engines
   * that charge for every request.
   */
  interimEveryMs?: number | null
  /** Silence this long ends the sentence, and its text becomes final. */
  pauseMs?: number
  /** Past this length, the next breath ends the sentence. */
  softMaxMs?: number
  /** Past this length the sentence is cut wherever it is. Whisper reads 30 seconds at most. */
  hardMaxMs?: number
  /** Audio kept from before the voice was noticed, so the first sound is not clipped. */
  prerollMs?: number
  /** Sounds shorter than this (a click, a tap on the desk) are not sent at all. */
  minVoicedMs?: number
}

/** A gap this short is a breath between words, not the end of a sentence. */
const BREATH_MS = 200
/** Engines misread very short clips, so short ones are padded with silence up to this. */
const MIN_CLIP_MS = 1100
/** An engine that needs longer than this per request cannot keep up, so interim text is given up. */
const SLOW_REQUEST_MS = 6000
/** How much of the text so far is handed to the engine as context for the next piece. */
const CONTEXT_CHARS = 200

interface Job {
  utterance: number
  startMs: number
  samples: Float32Array
  final: boolean
}

/**
 * Live transcription for engines that take one clip at a time. The recording
 * is cut at the speaker's pauses and every piece is sent as soon as it ends,
 * so text arrives sentence by sentence while the recording goes on. Requests
 * run one after another, in order; pieces that pile up behind a slow engine
 * are joined into one request. Only pieces in which a voice was heard are
 * sent, because Whisper invents sentences when it is given silence, and each
 * piece is dropped from memory once it has been sent.
 */
export function createChunkedLiveSession(
  provider: STTProvider,
  options: TranscribeOptions,
  sampleRate: number,
  config: ChunkedLiveConfig = {},
): LiveSession {
  const {
    interimEveryMs = 1500,
    pauseMs = 600,
    softMaxMs = 8000,
    hardMaxMs = 25_000,
    prerollMs = 300,
    minVoicedMs = 150,
  } = config

  const toSamples = (ms: number) => Math.round((sampleRate * ms) / 1000)
  const toMs = (samples: number) => Math.round((samples / sampleRate) * 1000)

  const listeners = new Set<(event: LiveEvent) => void>()
  const cancel = new AbortController()
  const vad = createVad({ sampleRate, hangoverMs: BREATH_MS })
  const segments: TranscriptSegment[] = []
  let cost: CostInfo | null = null
  let totalSamples = 0

  /** The latest audio while nobody is speaking. */
  let preroll: Float32Array[] = []
  let prerollSamples = 0

  /** The sentence being spoken, or null between sentences. */
  let utterance: Float32Array[] | null = null
  let utteranceIndex = 0
  let utteranceStart = 0
  let utteranceSamples = 0
  /** Voice heard in the sentence up to the last pause, and when the voice now sounding began. */
  let voicedMs = 0
  let voiceSince: number | null = null
  let quietSamples = 0
  let interimAt = 0

  const waiting: Job[] = []
  /** Settles when the engine has caught up; null while it is idle. */
  let draining: Promise<void> | null = null
  let lastRequestMs = 0
  let failure: { cause: unknown } | null = null
  let closed = false
  let aborted = false
  let stopping: Promise<TranscriptionResult> | undefined

  const emit = (event: LiveEvent) => listeners.forEach((listener) => listener(event))

  /** The glossary, then the end of what was said so far, so spelling and style carry over. */
  const promptFor = (): string => {
    const said = segments.map((segment) => segment.text).join(' ')
    const tail =
      said.length > CONTEXT_CHARS ? said.slice(-CONTEXT_CHARS).replace(/^\S*\s/, '') : said
    return `${options.prompt ?? ''} ${tail}`.trim()
  }

  const padded = (samples: Float32Array): Float32Array => {
    const minimum = toSamples(MIN_CLIP_MS)
    if (samples.length >= minimum) return samples
    const clip = new Float32Array(minimum)
    clip.set(samples)
    return clip
  }

  const work = async (job: Job): Promise<void> => {
    if (aborted || failure) return
    const began = Date.now()
    try {
      const result = await provider.transcribe(
        { kind: 'pcm', sampleRate, samples: padded(job.samples) },
        { ...options, prompt: promptFor() },
        cancel.signal,
      )
      if (aborted) return
      lastRequestMs = Date.now() - began
      cost = addCosts(cost, result.cost)
      const heard = result.segments.filter((segment) => segment.text.trim().length > 0)
      if (!job.final) {
        emit({ type: 'interim', text: heard.map((segment) => segment.text.trim()).join(' ') })
        return
      }
      // Nothing recognized: whatever interim text was showing for this piece goes away.
      if (heard.length === 0) emit({ type: 'interim', text: '' })
      // Engines sometimes time a segment past the end of the clip they were given.
      const within = (ms: number) =>
        job.startMs + Math.min(Math.max(0, ms), toMs(job.samples.length))
      heard.forEach((segment, index) => {
        const final: TranscriptSegment = {
          id: `live-${job.utterance}-${index + 1}`,
          text: segment.text.trim(),
          startMs: within(segment.startMs),
          endMs: within(segment.endMs),
        }
        segments.push(final)
        emit({ type: 'final', segment: final })
      })
    } catch (cause) {
      if (aborted) return
      failure = { cause }
      emit({ type: 'error', error: toAppError(cause) })
    }
  }

  const drain = async () => {
    for (let job = waiting.shift(); job; job = waiting.shift()) await work(job)
    draining = null
  }

  const enqueue = (job: Job) => {
    const last = waiting.at(-1)
    const joined = (last?.samples.length ?? 0) + job.samples.length
    if (job.final && last?.final && joined <= toSamples(hardMaxMs)) {
      // The engine is behind: one request for both pieces costs it about as much as one.
      // The silence between them is left out, so the second piece's times come out early.
      last.samples = concatSamples([last.samples, job.samples])
    } else {
      waiting.push(job)
    }
    draining ??= drain()
  }

  const snapshot = (final: boolean): Job => ({
    utterance: utteranceIndex,
    startMs: toMs(utteranceStart),
    samples: concatSamples(utterance ?? []),
    final,
  })

  const endUtterance = () => {
    if (!utterance) return
    const sounding = voiceSince === null ? 0 : toMs(totalSamples) - voiceSince
    if (voicedMs + sounding >= minVoicedMs) enqueue(snapshot(true))
    utterance = null
    preroll = []
    prerollSamples = 0
  }

  const keepPreroll = (block: Float32Array) => {
    preroll.push(block)
    prerollSamples += block.length
    const limit = toSamples(prerollMs)
    while (preroll.length > 1 && prerollSamples - (preroll[0]?.length ?? 0) >= limit) {
      prerollSamples -= preroll.shift()?.length ?? 0
    }
  }

  const beginUtterance = (voiceStartMs: number) => {
    utterance = preroll
    utteranceSamples = prerollSamples
    utteranceStart = totalSamples - prerollSamples
    utteranceIndex += 1
    voicedMs = 0
    voiceSince = voiceStartMs
    quietSamples = 0
    interimAt = 0
    preroll = []
    prerollSamples = 0
  }

  return {
    pushAudio(samples) {
      if (closed) return
      const block = samples.slice()
      totalSamples += block.length
      const changes = vad.process(block)

      if (!utterance) {
        keepPreroll(block)
        if (!vad.speaking) return
        // No start in this block means the voice carries on from a sentence that was cut.
        const began = changes.findLast((change) => change.type === 'speech-start')
        beginUtterance(began?.atMs ?? toMs(totalSamples - block.length))
      } else {
        utterance.push(block)
        utteranceSamples += block.length
        for (const change of changes) {
          if (change.type === 'speech-start') voiceSince = change.atMs
          else if (voiceSince !== null) {
            voicedMs += change.atMs - voiceSince
            voiceSince = null
          }
        }
      }
      quietSamples = vad.speaking ? 0 : quietSamples + block.length

      const length = toMs(utteranceSamples)
      // The detector itself waits out a breath before it reports quiet.
      const paused = !vad.speaking && toMs(quietSamples) + BREATH_MS >= pauseMs
      if (paused || (length >= softMaxMs && !vad.speaking) || length >= hardMaxMs) {
        endUtterance()
        return
      }

      // Interim text only fills idle time: it never holds up a finished sentence.
      const due = toMs(utteranceSamples - interimAt)
      const keepsUp = lastRequestMs <= SLOW_REQUEST_MS
      if (interimEveryMs !== null && draining === null && keepsUp && due >= interimEveryMs) {
        interimAt = utteranceSamples
        enqueue(snapshot(false))
      }
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    stop() {
      stopping ??= (async () => {
        closed = true
        endUtterance()
        while (draining) await draining
        if (failure) throw failure.cause
        return { segments: [...segments], durationMs: toMs(totalSamples), cost }
      })()
      return stopping
    },
    abort() {
      closed = true
      aborted = true
      utterance = null
      preroll = []
      cancel.abort()
      listeners.clear()
    },
  }
}
