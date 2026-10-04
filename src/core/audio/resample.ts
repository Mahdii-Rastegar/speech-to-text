export interface Resampler {
  /** Converts the next block of a continuous stream. Blocks may have any length. */
  process(input: Float32Array): Float32Array
  /** Forgets the stream so far, ready for a new one. */
  reset(): void
}

/** Lobes of the sinc kernel on each side. More is sharper and slower. */
const ZERO_CROSSINGS = 8

/** Keeps the cutoff a little under the new Nyquist limit, where the filter is still rolling off. */
const CUTOFF_MARGIN = 0.92

/**
 * Streaming sample-rate converter (windowed sinc). Microphones deliver 44.1 or
 * 48 kHz and speech engines want 16 kHz; frequencies the lower rate cannot hold
 * are filtered out first so they do not fold back into the speech band.
 */
export function createResampler(inputRate: number, outputRate: number): Resampler {
  if (inputRate === outputRate) {
    return { process: (input) => input.slice(), reset() {} }
  }

  /** Input samples per output sample. */
  const step = inputRate / outputRate
  /** Cutoff as a fraction of the input Nyquist frequency. */
  const cutoff = Math.min(1, outputRate / inputRate) * CUTOFF_MARGIN
  const halfWidth = Math.ceil(ZERO_CROSSINGS / cutoff)

  const kernel = (distance: number): number => {
    if (distance === 0) return cutoff
    const x = Math.PI * cutoff * distance
    const window = 0.5 * (1 + Math.cos((Math.PI * distance) / halfWidth))
    return ((cutoff * Math.sin(x)) / x) * window
  }

  /** Samples kept from earlier blocks, because the kernel reaches back into them. */
  let history = new Float32Array(0)
  /** Where the next output sample sits, measured in input samples from the start of `history`. */
  let position = 0

  return {
    process(input) {
      const data = new Float32Array(history.length + input.length)
      data.set(history)
      data.set(input, history.length)

      // One spare slot, so rounding in the estimate can never drop a sample.
      const capacity = Math.max(0, Math.ceil((data.length - halfWidth - position) / step)) + 1
      const output = new Float32Array(capacity)
      let count = 0

      // An output sample is ready once the kernel's leading edge is inside the data.
      while (position + halfWidth < data.length) {
        const first = Math.max(0, Math.ceil(position - halfWidth))
        const last = Math.floor(position + halfWidth)
        let sum = 0
        for (let index = first; index <= last; index++) {
          sum += (data[index] ?? 0) * kernel(index - position)
        }
        output[count++] = sum
        position += step
      }

      const keepFrom = Math.max(0, Math.floor(position) - halfWidth)
      history = data.slice(keepFrom)
      position -= keepFrom
      return count === output.length ? output : output.slice(0, count)
    },
    reset() {
      history = new Float32Array(0)
      position = 0
    },
  }
}
