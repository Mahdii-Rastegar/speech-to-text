/** Synthetic audio for tests. Deterministic, so results never depend on chance. */

export function silence(ms: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round((sampleRate * ms) / 1000))
}

/** Steady noise at a given peak amplitude: loud and broadband, like a held voice. */
export function noise(ms: number, sampleRate: number, amplitude = 0.1): Float32Array {
  const samples = new Float32Array(Math.round((sampleRate * ms) / 1000))
  let seed = 12345
  for (let index = 0; index < samples.length; index++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    samples[index] = (seed / 0x3fffffff - 1) * amplitude
  }
  return samples
}

export function sine(
  ms: number,
  sampleRate: number,
  frequency: number,
  amplitude = 0.5,
): Float32Array {
  const samples = new Float32Array(Math.round((sampleRate * ms) / 1000))
  for (let index = 0; index < samples.length; index++) {
    samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate)
  }
  return samples
}

export function concat(...parts: Float32Array[]): Float32Array {
  const joined = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.length
  }
  return joined
}
