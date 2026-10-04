export type LanguageSetting = 'auto' | 'fa' | 'en'

export type SessionStatus = 'recording' | 'transcribing' | 'processing' | 'done' | 'error'

export type TranscriptVersion = 'raw' | 'clean' | 'summary'

export type AudioSource = 'microphone' | 'file'

export interface CostInfo {
  amountUsd: number
  /** True when the amount is computed from list prices rather than reported by the provider. */
  estimated: boolean
}

/**
 * One transcription session as it is stored in History.
 * Audio is never part of it: only text and metadata are kept.
 */
export interface TranscriptionSession {
  id: string
  /** ISO 8601 timestamps. */
  createdAt: string
  updatedAt: string
  durationMs: number
  language: LanguageSetting
  source: AudioSource
  provider: string
  model: string
  /** AI-generated title. Null means the UI falls back to the date. */
  title: string | null
  /** The engine's output. AI processing never overwrites it. */
  rawTranscript: string
  cleanTranscript: string | null
  summary: string | null
  /** Null for local inference. */
  cost: CostInfo | null
  status: SessionStatus
}

export function createSessionId(): string {
  return crypto.randomUUID()
}

export function transcriptOf(session: TranscriptionSession, version: TranscriptVersion): string {
  if (version === 'clean') return session.cleanTranscript ?? ''
  if (version === 'summary') return session.summary ?? ''
  return session.rawTranscript
}

/** Adds up costs from the STT and AI steps. The total is exact only if every part is. */
export function addCosts(a: CostInfo | null, b: CostInfo | null): CostInfo | null {
  if (!a) return b
  if (!b) return a
  return { amountUsd: a.amountUsd + b.amountUsd, estimated: a.estimated || b.estimated }
}
