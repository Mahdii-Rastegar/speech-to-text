import { createVad } from '../audio/vad'
import { addCosts, type CostInfo } from '../session'
import { contextPrompt, padClip } from './clip'
import type {
  STTProvider,
  TranscribeOptions,
  TranscriptSegment,
  TranscriptionResult,
} from './provider'

/** A stretch of the recording that goes to the engine in one request, in samples. */
export interface Piece {
  start: number
  end: number
}

export interface FileTranscriptionHooks {
  /** A piece of text that will not change anymore. */
  onSegment?(segment: TranscriptSegment): void
  /** How much of the recording has been dealt with, from 0 to 1. */
  onProgress?(fraction: number): void
}

/** Whisper reads 30 seconds at most; this leaves room for the padding around a piece. */
const MAX_PIECE_MS = 25_000
/** A gap this short is a breath between words, not a place to cut. */
const BREATH_MS = 200
/** Quiet audio kept on each side of a piece, so its first and last sounds are not clipped. */
const PAD_MS = 300
/** Sounds shorter than this (a click, a door) are not sent at all. */
const MIN_VOICED_MS = 150
/** When someone talks past the limit without a pause, the cut is looked for this far back. */
const CUT_SEARCH_MS = 5000
const CUT_FRAME_MS = 50

/** The quietest moment between two points: the least harmful place to cut through speech. */
function quietestPoint(samples: Float32Array, from: number, to: number, frame: number): number {
  let best = to
  let bestEnergy = Infinity
  for (let start = from; start + frame <= to; start += frame) {
    let energy = 0
    for (let index = start; index < start + frame; index++) energy += (samples[index] ?? 0) ** 2
    if (energy < bestEnergy) {
      bestEnergy = energy
      best = start + Math.round(frame / 2)
    }
  }
  return best
}

/**
 * Decides where a whole recording is cut. Only the parts in which a voice is
 * heard are kept, because Whisper invents sentences when it is given silence.
 * Neighbouring parts are joined up to the length an engine reads in one go,
 * so the cuts fall in the speaker's pauses.
 */
export function planPieces(
  samples: Float32Array,
  sampleRate: number,
  maxPieceMs: number = MAX_PIECE_MS,
): Piece[] {
  const toSamples = (ms: number) => Math.round((sampleRate * ms) / 1000)
  const limit = toSamples(maxPieceMs)

  const voiced: Piece[] = []
  let start: number | null = null
  for (const event of createVad({ sampleRate, hangoverMs: BREATH_MS }).process(samples)) {
    if (event.type === 'speech-start') start = toSamples(event.atMs)
    else if (start !== null) {
      voiced.push({ start, end: Math.min(samples.length, toSamples(event.atMs)) })
      start = null
    }
  }
  if (start !== null) voiced.push({ start, end: samples.length })

  const pieces: Piece[] = []
  let current: (Piece & { voiced: number }) | null = null
  const close = () => {
    if (current && current.voiced >= toSamples(MIN_VOICED_MS)) {
      pieces.push({ start: current.start, end: current.end })
    }
    current = null
  }
  const add = (part: Piece) => {
    if (current && part.end - current.start > limit) close()
    if (current) {
      current.end = part.end
      current.voiced += part.end - part.start
    } else {
      current = { ...part, voiced: part.end - part.start }
    }
  }

  for (const region of voiced) {
    let from = region.start
    while (region.end - from > limit) {
      const cut = quietestPoint(
        samples,
        from + limit - Math.min(limit, toSamples(CUT_SEARCH_MS)),
        from + limit,
        toSamples(CUT_FRAME_MS),
      )
      add({ start: from, end: cut })
      from = cut
    }
    add({ start: from, end: region.end })
  }
  close()
  return pieces
}

/**
 * Turns a whole recording (an uploaded file) into text with an engine that
 * takes one clip at a time. The pieces go to the engine one after another, so
 * text and progress arrive while the work is still going on, and the work can
 * be cancelled between two pieces.
 */
export async function transcribeRecording(
  provider: STTProvider,
  samples: Float32Array,
  sampleRate: number,
  options: TranscribeOptions,
  hooks: FileTranscriptionHooks = {},
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  const toMs = (count: number) => Math.round((count / sampleRate) * 1000)
  const pad = Math.round((sampleRate * PAD_MS) / 1000)

  const pieces = planPieces(samples, sampleRate)
  const segments: TranscriptSegment[] = []
  let cost: CostInfo | null = null

  for (const [index, piece] of pieces.entries()) {
    signal?.throwIfAborted()

    // Padding never reaches into a neighbour: a gap between two pieces is shared half and half.
    const previous = pieces[index - 1]
    const next = pieces[index + 1]
    const lead = previous ? Math.floor((piece.start - previous.end) / 2) : piece.start
    const trail = next ? Math.floor((next.start - piece.end) / 2) : samples.length - piece.end
    const from = piece.start - Math.min(pad, lead)
    const clip = samples.subarray(from, piece.end + Math.min(pad, trail))

    const result = await provider.transcribe(
      { kind: 'pcm', sampleRate, samples: padClip(clip, sampleRate) },
      {
        ...options,
        prompt: contextPrompt(options.prompt, segments.map((segment) => segment.text).join(' ')),
      },
      signal,
    )
    signal?.throwIfAborted()
    cost = addCosts(cost, result.cost)

    // Engines sometimes time a segment past the end of the clip they were given.
    const within = (ms: number) => toMs(from) + Math.min(Math.max(0, ms), toMs(clip.length))
    const heard = result.segments.filter((segment) => segment.text.trim().length > 0)
    heard.forEach((segment, position) => {
      const final: TranscriptSegment = {
        id: `file-${index + 1}-${position + 1}`,
        text: segment.text.trim(),
        startMs: within(segment.startMs),
        endMs: within(segment.endMs),
      }
      segments.push(final)
      hooks.onSegment?.(final)
    })
    hooks.onProgress?.(piece.end / samples.length)
  }

  hooks.onProgress?.(1)
  return { segments, durationMs: toMs(samples.length), cost }
}
