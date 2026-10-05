import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The browser under test gets a synthetic microphone instead of a real one:
 * a voice-like tone for a few seconds, then a pause, repeated. The file is
 * generated on the fly, so no recording of anyone ever lives in the repository.
 */

const SAMPLE_RATE = 48_000
export const FAKE_SPEECH_MS = 6000
export const FAKE_PAUSE_MS = 1500

/** A buzzing, vowel-like sound with the rhythm of syllables. It never drops to silence mid-phrase. */
function voiceSample(time: number): number {
  const pitch = 130 + 25 * Math.sin(2 * Math.PI * 0.4 * time)
  let sample = 0
  for (let harmonic = 1; harmonic <= 24; harmonic++) {
    const frequency = pitch * harmonic
    // Two broad resonances, roughly where an open vowel has them.
    const resonance =
      Math.exp(-(((frequency - 700) / 400) ** 2)) +
      0.6 * Math.exp(-(((frequency - 1300) / 500) ** 2))
    sample += (0.15 + resonance) * Math.sin(2 * Math.PI * frequency * time)
  }
  const syllables = 0.45 + 0.55 * Math.abs(Math.sin(2 * Math.PI * 2.2 * time))
  return (sample / 6) * syllables * 0.5
}

/** One round of voice and pause as 16-bit samples. Synthesized once: it is the slow part. */
let cyclePcm: Buffer | undefined

function buildCycle(): Buffer {
  const speech = Math.round((SAMPLE_RATE * FAKE_SPEECH_MS) / 1000)
  const pcm = Buffer.alloc((speech + Math.round((SAMPLE_RATE * FAKE_PAUSE_MS) / 1000)) * 2)
  for (let index = 0; index < speech; index++) {
    const sample = Math.max(-1, Math.min(1, voiceSample(index / SAMPLE_RATE)))
    pcm.writeInt16LE(Math.round(sample * 32767), index * 2)
  }
  return pcm
}

/** The sound as a WAV file, also used as a file to upload. `cycles` repeats voice and pause. */
export function buildWav(cycles = 1): Buffer {
  cyclePcm ??= buildCycle()
  const dataBytes = cyclePcm.length * cycles
  const header = Buffer.alloc(44)

  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataBytes, 40)

  return Buffer.concat([header, ...Array.from({ length: cycles }, () => cyclePcm as Buffer)])
}

/** Writes the file outside the project and returns its path. */
export function prepareFakeMicrophone(): string {
  const directory = join(tmpdir(), 'stt-app-e2e')
  mkdirSync(directory, { recursive: true })
  const path = join(directory, 'fake-microphone.wav')
  writeFileSync(path, buildWav())
  return path
}

/** Browser switches that replace the real microphone with the generated file and skip the prompt. */
export function fakeMicrophoneArgs(): string[] {
  return [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${prepareFakeMicrophone()}`,
  ]
}
