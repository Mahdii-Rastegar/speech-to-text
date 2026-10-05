/** Joins captured blocks into one continuous signal. */
export function concatSamples(blocks: readonly Float32Array[]): Float32Array {
  const joined = new Float32Array(blocks.reduce((total, block) => total + block.length, 0))
  let offset = 0
  for (const block of blocks) {
    joined.set(block, offset)
    offset += block.length
  }
  return joined
}

/** Samples in -1..1 as 16-bit integers, the format speech engines read. Louder values are clipped. */
export function toPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    pcm[index] = Math.round(sample * 32767)
  }
  return pcm
}
