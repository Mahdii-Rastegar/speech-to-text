import type { LanguageSetting } from './session'

/** Non-secret preferences. API keys live in the platform's secret store, never here. */
export interface Settings {
  sttProviderId: string
  sttModel: string
  language: LanguageSetting
  /** Id of the microphone to record from. Empty means whatever the system has as its default. */
  microphoneId: string
  /** Master switch for the AI step that runs after transcription. */
  aiEnabled: boolean
  cleanEnabled: boolean
  summaryEnabled: boolean
  /** The welcome screen has been seen and closed. */
  onboarded: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  sttProviderId: 'demo-local',
  sttModel: 'large-v3-turbo',
  language: 'auto',
  microphoneId: '',
  aiEnabled: false,
  cleanEnabled: true,
  summaryEnabled: false,
  onboarded: false,
}

const LANGUAGES: readonly LanguageSetting[] = ['auto', 'fa', 'en']

const isLanguage = (value: unknown): value is LanguageSetting =>
  LANGUAGES.includes(value as LanguageSetting)

const stringOr = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.length > 0 ? value : fallback

const booleanOr = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

/**
 * Reads stored preferences defensively: anything missing or of the wrong type
 * falls back to its default, so an old or hand-edited file can never break startup.
 */
export function parseSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS
  const value = raw as Record<string, unknown>
  return {
    sttProviderId: stringOr(value.sttProviderId, DEFAULT_SETTINGS.sttProviderId),
    sttModel: stringOr(value.sttModel, DEFAULT_SETTINGS.sttModel),
    language: isLanguage(value.language) ? value.language : DEFAULT_SETTINGS.language,
    microphoneId: typeof value.microphoneId === 'string' ? value.microphoneId : '',
    aiEnabled: booleanOr(value.aiEnabled, DEFAULT_SETTINGS.aiEnabled),
    cleanEnabled: booleanOr(value.cleanEnabled, DEFAULT_SETTINGS.cleanEnabled),
    summaryEnabled: booleanOr(value.summaryEnabled, DEFAULT_SETTINGS.summaryEnabled),
    onboarded: booleanOr(value.onboarded, DEFAULT_SETTINGS.onboarded),
  }
}
