import type { AppError } from '../errors'
import type { CostInfo, LanguageSetting } from '../session'

export type ProviderKind = 'local' | 'cloud'

export interface STTCapabilities {
  /** `streaming`: the engine emits interim text itself. `batch`: one request, one result. */
  mode: 'streaming' | 'batch'
  /** Works with no network connection. */
  offline: boolean
  languages: readonly LanguageSetting[]
  /** How usage is billed. `none` for local inference. */
  billing: 'none' | 'per-audio-second'
}

export interface ModelInfo {
  id: string
}

export type AudioInput =
  | { kind: 'pcm'; sampleRate: number; samples: Float32Array }
  | { kind: 'file'; mimeType: string; data: Blob }

export interface TranscribeOptions {
  model: string
  language: LanguageSetting
}

export interface TranscriptSegment {
  id: string
  text: string
  startMs: number
  endMs: number
}

export interface TranscriptionResult {
  segments: TranscriptSegment[]
  durationMs: number
  cost: CostInfo | null
}

export type LiveEvent =
  /** Replaces the text that is still being recognized. An empty string clears it. */
  | { type: 'interim'; text: string }
  /** A piece of text that will not change anymore. */
  | { type: 'final'; segment: TranscriptSegment }
  | { type: 'error'; error: AppError }

export interface LiveSession {
  /** Feed captured audio (16 kHz mono). Batch engines buffer it; the demo engine only paces its script with it. */
  pushAudio(samples: Float32Array): void
  /** Subscribe to events. Returns the unsubscribe function. */
  onEvent(listener: (event: LiveEvent) => void): () => void
  /** Stop listening and resolve once every remaining piece of text is final. */
  stop(): Promise<TranscriptionResult>
  /** Drop the session immediately without waiting for pending text. */
  abort(): void
}

export interface ConfigValidation {
  ok: boolean
  error?: AppError
}

/**
 * The single contract every speech-to-text engine implements: local Whisper,
 * OpenAI-compatible cloud APIs (OpenRouter, Groq) and the demo engine.
 * The rest of the app only talks to this interface.
 */
export interface STTProvider {
  readonly id: string
  readonly kind: ProviderKind
  readonly models: readonly ModelInfo[]
  getCapabilities(): STTCapabilities
  validateConfiguration(): Promise<ConfigValidation>
  transcribe(
    audio: AudioInput,
    options: TranscribeOptions,
    signal?: AbortSignal,
  ): Promise<TranscriptionResult>
  /**
   * Native live transcription. Batch-only engines leave this out and are wrapped
   * by the chunking live transcriber instead.
   */
  transcribeStream?(options: TranscribeOptions): LiveSession
  /** Null when the engine is free to run (local inference). */
  estimateCost(audioSeconds: number, model: string): CostInfo | null
}

export function joinSegments(segments: readonly TranscriptSegment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join(' ')
}
