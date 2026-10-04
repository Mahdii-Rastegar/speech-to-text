import { rmsOf, SILENCE_DB, toDecibels } from './signal'

export type VadEvent =
  /** Speech began at `atMs` of the stream (the start of the sound, not the moment it was confirmed). */
  | { type: 'speech-start'; atMs: number }
  /** Speech ended at `atMs` (the last voiced moment, not the end of the waiting period). */
  | { type: 'speech-end'; atMs: number }

export interface VadOptions {
  sampleRate: number
  /** Length of one analysis frame. */
  frameMs?: number
  /** How far above the background noise a frame must be to count as voice. */
  marginDb?: number
  /** Voice must stay this far above the noise to keep going; lower than `marginDb` to avoid flicker. */
  releaseMarginDb?: number
  /** Nothing quieter than this counts as voice, however silent the room is. */
  minSpeechDb?: number
  /** Sound must last this long before it is called speech, so clicks and taps are ignored. */
  onsetMs?: number
  /** Silence must last this long before speech is called finished, so pauses between words survive. */
  hangoverMs?: number
}

export interface Vad {
  /** Feed the next block of a continuous stream; returns the changes it caused, in order. */
  process(samples: Float32Array): VadEvent[]
  readonly speaking: boolean
  /** Level of the latest frame in dBFS. */
  readonly levelDb: number
  reset(): void
}

const INITIAL_NOISE_DB = -50
const MIN_NOISE_DB = -75
const MAX_NOISE_DB = -30
/** The noise estimate follows a quieter room at once and a louder one slowly. */
const NOISE_FALL_RATE = 0.2
const NOISE_RISE_DB_PER_SECOND = 2
/** While someone is talking the estimate barely rises, so long sentences are not mistaken for noise. */
const NOISE_RISE_DB_PER_SECOND_SPEAKING = 0.5

/**
 * Voice activity detector based on loudness against an adaptive noise floor.
 * It needs no model and no network, and decides in a few microseconds per
 * frame. It tells sound from silence, not speech from other sounds.
 */
export function createVad(options: VadOptions): Vad {
  const {
    sampleRate,
    frameMs = 20,
    marginDb = 12,
    releaseMarginDb = 7,
    minSpeechDb = -50,
    onsetMs = 60,
    hangoverMs = 600,
  } = options

  const frameSize = Math.round((sampleRate * frameMs) / 1000)
  const onsetFrames = Math.max(1, Math.round(onsetMs / frameMs))
  const hangoverFrames = Math.max(1, Math.round(hangoverMs / frameMs))
  const riseStep = (rate: number) => (rate * frameMs) / 1000

  const frame = new Float32Array(frameSize)
  let filled = 0
  let frameIndex = 0
  let noiseDb = INITIAL_NOISE_DB
  let levelDb = SILENCE_DB
  let speaking = false
  /** Consecutive loud frames while silent, or quiet frames while speaking. */
  let run = 0

  const analyze = (events: VadEvent[]) => {
    levelDb = toDecibels(rmsOf(frame))

    if (levelDb < noiseDb) noiseDb += (levelDb - noiseDb) * NOISE_FALL_RATE
    else {
      const rate = speaking ? NOISE_RISE_DB_PER_SECOND_SPEAKING : NOISE_RISE_DB_PER_SECOND
      noiseDb += Math.min(levelDb - noiseDb, riseStep(rate))
    }
    noiseDb = Math.min(MAX_NOISE_DB, Math.max(MIN_NOISE_DB, noiseDb))

    if (speaking) {
      const voiced = levelDb >= Math.max(noiseDb + releaseMarginDb, minSpeechDb - 5)
      run = voiced ? 0 : run + 1
      if (run >= hangoverFrames) {
        speaking = false
        events.push({ type: 'speech-end', atMs: (frameIndex + 1 - run) * frameMs })
        run = 0
      }
    } else {
      const voiced = levelDb >= Math.max(noiseDb + marginDb, minSpeechDb)
      run = voiced ? run + 1 : 0
      if (run >= onsetFrames) {
        speaking = true
        events.push({ type: 'speech-start', atMs: (frameIndex + 1 - run) * frameMs })
        run = 0
      }
    }
    frameIndex += 1
  }

  return {
    process(samples) {
      const events: VadEvent[] = []
      let offset = 0
      while (offset < samples.length) {
        const take = Math.min(frameSize - filled, samples.length - offset)
        frame.set(samples.subarray(offset, offset + take), filled)
        filled += take
        offset += take
        if (filled === frameSize) {
          analyze(events)
          filled = 0
        }
      }
      return events
    },
    get speaking() {
      return speaking
    },
    get levelDb() {
      return levelDb
    },
    reset() {
      filled = 0
      frameIndex = 0
      noiseDb = INITIAL_NOISE_DB
      levelDb = SILENCE_DB
      speaking = false
      run = 0
    },
  }
}
