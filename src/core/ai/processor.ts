import type { AppError } from '../errors'
import type { CostInfo } from '../session'

export interface AIProcessingOptions {
  /** Fix grammar and punctuation without changing meaning or register. */
  clean: boolean
  summary: boolean
  title: boolean
}

export interface AIProcessingResult {
  cleanTranscript: string | null
  summary: string | null
  title: string | null
  cost: CostInfo | null
  /** Why a requested part is missing. The parts that did succeed are still returned. */
  error: AppError | null
}

/**
 * Text-only AI step that runs after transcription. It is separate from the STT
 * provider on purpose: any engine can be combined with any AI provider.
 * The raw transcript is an input only and is never modified.
 */
export interface AIProcessor {
  readonly id: string
  process(
    rawTranscript: string,
    options: AIProcessingOptions,
    signal?: AbortSignal,
  ): Promise<AIProcessingResult>
}
