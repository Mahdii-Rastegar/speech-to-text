/** Loudness below anything a microphone produces; stands in for "no signal at all". */
export const SILENCE_DB = -100

/** Root mean square of a block of samples in the range -1..1. */
export function rmsOf(samples: Float32Array, start = 0, end = samples.length): number {
  if (end <= start) return 0
  let sum = 0
  for (let index = start; index < end; index++) {
    const sample = samples[index] ?? 0
    sum += sample * sample
  }
  return Math.sqrt(sum / (end - start))
}

/** Level in dB relative to full scale: 0 is the loudest possible, quieter is more negative. */
export function toDecibels(rms: number): number {
  return rms <= 0 ? SILENCE_DB : Math.max(SILENCE_DB, 20 * Math.log10(rms))
}
