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

function buildWav(): Buffer {
  const speech = Math.round((SAMPLE_RATE * FAKE_SPEECH_MS) / 1000)
  const total = speech + Math.round((SAMPLE_RATE * FAKE_PAUSE_MS) / 1000)
  const dataBytes = total * 2
  const wav = Buffer.alloc(44 + dataBytes)

  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataBytes, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(SAMPLE_RATE, 24)
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataBytes, 40)

  for (let index = 0; index < speech; index++) {
    const sample = Math.max(-1, Math.min(1, voiceSample(index / SAMPLE_RATE)))
    wav.writeInt16LE(Math.round(sample * 32767), 44 + index * 2)
  }
  return wav
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
