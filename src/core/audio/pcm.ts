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

/** A mono signal as a 16-bit WAV file, the one format every cloud speech service reads. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const HEADER_BYTES = 44
  const pcm = toPcm16(samples)
  const wav = new Uint8Array(HEADER_BYTES + pcm.byteLength)
  const view = new DataView(wav.buffer)
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) wav[offset + index] = text.charCodeAt(index)
  }

  ascii(0, 'RIFF')
  view.setUint32(4, wav.length - 8, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true) // length of the format block
  view.setUint16(20, 1, true) // uncompressed PCM
  view.setUint16(22, 1, true) // one channel
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes per second
  view.setUint16(32, 2, true) // bytes per sample
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  for (let index = 0; index < pcm.length; index++) {
    view.setInt16(HEADER_BYTES + index * 2, pcm[index] ?? 0, true)
  }
  return wav
}
