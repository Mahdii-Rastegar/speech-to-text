/** Anything that can report how loud the input is right now. */
export interface LevelSource {
  /** Loudness from 0 (silence) to 1 (loud). */
  read(): number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Speech-shaped loudness without a microphone: syllable-rate movement inside
 * phrases, separated by short pauses. The real capture pipeline replaces this
 * with the measured level of the input.
 */
export function createSimulatedLevel(now: () => number = () => performance.now()): LevelSource {
  return {
    read() {
      const t = now() / 1000
      const phrase = Math.sin(t * 0.9) + 0.6 * Math.sin(t * 0.37 + 1.3)
      const speaking = clamp01((phrase + 0.9) * 1.6)
      const syllables = 0.55 + 0.3 * Math.sin(t * 7.3) + 0.15 * Math.sin(t * 13.1 + 0.7)
      const jitter = 0.08 * (Math.random() - 0.5)
      return clamp01(speaking * syllables + jitter)
    },
  }
}
