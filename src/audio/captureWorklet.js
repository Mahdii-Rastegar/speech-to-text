// Runs on the audio thread. Collects the microphone signal into blocks and hands
// them to the page. Kept as plain JavaScript with no imports, because the browser
// loads this file by URL into its own scope.

/** Samples per block: about 21 ms at 48 kHz. */
const BLOCK_SIZE = 1024

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.block = new Float32Array(BLOCK_SIZE)
    this.filled = 0
  }

  process(inputs) {
    // The node asks for mono, so the first channel is the whole signal.
    const channel = inputs[0]?.[0]
    if (!channel) return true

    for (let index = 0; index < channel.length; index++) {
      this.block[this.filled++] = channel[index]
      if (this.filled === BLOCK_SIZE) {
        this.port.postMessage(this.block, [this.block.buffer])
        this.block = new Float32Array(BLOCK_SIZE)
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('capture', CaptureProcessor)
