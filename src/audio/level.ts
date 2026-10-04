import { rmsOf, toDecibels } from '@/core/audio/signal'

/** Anything that can report how loud the input is right now. */
export interface LevelSource {
  /** Loudness from 0 (silence) to 1 (loud). */
  read(): number
}

export interface LevelMeter extends LevelSource {
  /** Measure the next block of captured audio. */
  push(samples: Float32Array): void
  /** Back to silence, for when capture stops. */
  reset(): void
}

/** The range shown on screen: a quiet room sits at the bottom, a raised voice at the top. */
const FLOOR_DB = -60
const CEILING_DB = -12

/** How much of the previous level survives each block, so peaks fade instead of vanishing. */
const DECAY = 0.75

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Turns captured audio into the 0..1 level that drives the voice line and the record key. */
export function createLevelMeter(): LevelMeter {
  let level = 0
  return {
    push(samples) {
      const db = toDecibels(rmsOf(samples))
      const current = clamp01((db - FLOOR_DB) / (CEILING_DB - FLOOR_DB))
      level = Math.max(current, level * DECAY)
    },
    reset() {
      level = 0
    },
    read: () => level,
  }
}
