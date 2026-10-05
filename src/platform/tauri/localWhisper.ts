import { invoke, isTauri } from '@tauri-apps/api/core'
import { toPcm16 } from '@/core/audio/pcm'
import { AppFailure, createAppError, type AppErrorKind } from '@/core/errors'
import type { ModelInfo, STTProvider } from '@/core/stt/provider'

export const LOCAL_WHISPER_ID = 'local-whisper'

/** The audio format the native side expects. */
const ENGINE_SAMPLE_RATE = 16_000

/** The same ids as the native side's catalog (`CATALOG` in `models.rs`). */
const MODELS: readonly ModelInfo[] = [{ id: 'large-v3-turbo' }, { id: 'small' }]

interface EngineTranscript {
  segments: { text: string; startMs: number; endMs: number }[]
  gpu: boolean
  elapsedMs: number
}

/** True inside the desktop app, where the native engine exists. */
export const hasNativeEngine = (): boolean => isTauri()

/** The native side's failure kinds, as the app's own. */
const KINDS: Record<string, AppErrorKind> = {
  'engine-missing': 'local-engine-missing',
  'model-missing': 'local-model-missing',
}

/** Turns what a failed native command rejects with into the app's own error. */
function toFailure(cause: unknown): AppFailure {
  const { kind, detail } = (typeof cause === 'object' && cause !== null ? cause : {}) as {
    kind?: unknown
    detail?: unknown
  }
  const text = typeof detail === 'string' ? detail : String(cause)
  return new AppFailure(
    createAppError((typeof kind === 'string' && KINDS[kind]) || 'provider-unavailable', text),
  )
}

/**
 * Decodes an audio file with the native side's own codecs, to 16 kHz mono.
 * For the formats the web view cannot read, Apple Lossless above all.
 */
export async function decodeWithNativeCodecs(bytes: ArrayBuffer): Promise<Float32Array> {
  const samples = await invoke<ArrayBuffer>('audio_decode', new Uint8Array(bytes))
  return new Float32Array(samples)
}

/** A small JSON header, its length in front of it, then the audio as 16-bit samples. */
function buildPayload(header: object, samples: Float32Array): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const pcm = toPcm16(samples)
  const payload = new Uint8Array(4 + headerBytes.length + pcm.byteLength)
  new DataView(payload.buffer).setUint32(0, headerBytes.length, true)
  payload.set(headerBytes, 4)
  payload.set(new Uint8Array(pcm.buffer), 4 + headerBytes.length)
  return payload
}

/**
 * Whisper running on this computer, inside the desktop app's native side.
 * Nothing is sent over the network. It takes a whole recording at a time.
 */
export function createLocalWhisperProvider(): STTProvider {
  return {
    id: LOCAL_WHISPER_ID,
    kind: 'local',
    models: MODELS,
    getCapabilities: () => ({
      mode: 'batch',
      offline: true,
      languages: ['auto', 'fa', 'en'],
      billing: 'none',
    }),
    async validateConfiguration(model) {
      try {
        await invoke('local_engine_check', { model: model ?? MODELS[0]?.id })
        return { ok: true }
      } catch (cause) {
        return { ok: false, error: toFailure(cause).appError }
      }
    },
    warmUp(model) {
      // A failure here shows up again, with its message, when the recording is transcribed.
      invoke('local_engine_warm', { model }).catch(() => {})
    },
    async transcribe(audio, options) {
      if (audio.kind !== 'pcm' || audio.sampleRate !== ENGINE_SAMPLE_RATE) {
        throw new AppFailure(createAppError('unknown', 'The local engine takes 16 kHz samples'))
      }
      const header = {
        model: options.model,
        language: options.language,
        prompt: options.prompt ?? '',
      }
      let transcript: EngineTranscript
      try {
        transcript = await invoke<EngineTranscript>(
          'local_engine_transcribe',
          buildPayload(header, audio.samples),
        )
      } catch (cause) {
        throw toFailure(cause)
      }
      return {
        segments: transcript.segments.map((segment, index) => ({
          id: `${LOCAL_WHISPER_ID}-${index + 1}`,
          ...segment,
        })),
        durationMs: Math.round((audio.samples.length / audio.sampleRate) * 1000),
        cost: null,
      }
    },
    estimateCost: () => null,
  }
}
