import { createAppError } from '@/core/errors'
import { isBusy } from '@/core/recording/machine'
import {
  addCosts,
  createSessionId,
  type LanguageSetting,
  type TranscriptionSession,
} from '@/core/session'
import type { Settings } from '@/core/settings'
import {
  joinSegments,
  type LiveEvent,
  type LiveSession,
  type STTProvider,
  type TranscriptionResult,
} from '@/core/stt/provider'
import { aiProcessor, FALLBACK_PROVIDER_ID, providers } from './services'
import { dispatchRecording, recordingStore } from './stores/recordingStore'
import {
  addSession,
  findSession,
  sessionsStore,
  setProcessing,
  updateSession,
  type ProcessingParts,
} from './stores/sessionsStore'
import { settingsStore, updateSettings } from './stores/settingsStore'
import { notify, uiStore } from './stores/uiStore'

interface ActiveRun {
  live: LiveSession
  unsubscribe: () => void
  providerId: string
  model: string
  language: LanguageSetting
  createdAt: string
}

let activeRun: ActiveRun | null = null

export function resolveProvider(settings: Settings): STTProvider {
  const provider = providers.get(settings.sttProviderId) ?? providers.get(FALLBACK_PROVIDER_ID)
  if (!provider) throw new Error('No speech-to-text provider is registered')
  return provider
}

export function resolveModel(provider: STTProvider, settings: Settings): string {
  const chosen = provider.models.find((model) => model.id === settings.sttModel)
  return (chosen ?? provider.models[0])?.id ?? ''
}

function endRun(): void {
  activeRun?.unsubscribe()
  activeRun = null
}

function handleLiveEvent(event: LiveEvent): void {
  switch (event.type) {
    case 'interim':
      dispatchRecording({ type: 'INTERIM', text: event.text })
      break
    case 'final':
      dispatchRecording({ type: 'FINAL', segment: event.segment })
      break
    case 'error':
      endRun()
      dispatchRecording({ type: 'FAILED', error: event.error, at: Date.now() })
      break
  }
}

export function startRecording(): void {
  if (isBusy(recordingStore.getState().phase)) return

  const settings = settingsStore.getState()
  const provider = resolveProvider(settings)
  const model = resolveModel(provider, settings)

  sessionsStore.setState({ activeSessionId: null })
  uiStore.setState({ version: 'raw' })
  dispatchRecording({ type: 'START_REQUESTED' })

  if (!provider.transcribeStream) {
    dispatchRecording({
      type: 'FAILED',
      error: createAppError('live-unsupported'),
      at: Date.now(),
    })
    return
  }

  let live: LiveSession
  try {
    live = provider.transcribeStream({ model, language: settings.language })
  } catch (cause) {
    dispatchRecording({
      type: 'FAILED',
      error: createAppError('unknown', cause instanceof Error ? cause.message : undefined),
      at: Date.now(),
    })
    return
  }

  activeRun = {
    live,
    unsubscribe: live.onEvent(handleLiveEvent),
    providerId: provider.id,
    model,
    language: settings.language,
    createdAt: new Date().toISOString(),
  }
  dispatchRecording({ type: 'STARTED', at: Date.now() })
  notify('recording-started')
}

export async function stopRecording(): Promise<void> {
  const run = activeRun
  if (!run || recordingStore.getState().phase !== 'recording') return

  dispatchRecording({ type: 'STOP_REQUESTED', at: Date.now() })

  let result: TranscriptionResult
  try {
    result = await run.live.stop()
  } catch (cause) {
    endRun()
    dispatchRecording({
      type: 'FAILED',
      error: createAppError('unknown', cause instanceof Error ? cause.message : undefined),
      at: Date.now(),
    })
    return
  }

  endRun()
  dispatchRecording({ type: 'FINALIZED' })

  const rawTranscript = joinSegments(result.segments)
  if (rawTranscript.length === 0) {
    dispatchRecording({ type: 'RESET' })
    notify('nothing-recorded')
    return
  }

  const now = new Date().toISOString()
  const session: TranscriptionSession = {
    id: createSessionId(),
    createdAt: run.createdAt,
    updatedAt: now,
    durationMs: recordingStore.getState().durationMs,
    language: run.language,
    source: 'microphone',
    provider: run.providerId,
    model: run.model,
    title: null,
    rawTranscript,
    cleanTranscript: null,
    summary: null,
    cost: result.cost,
    status: 'done',
  }
  addSession(session)
  notify('recording-stopped')

  const settings = settingsStore.getState()
  if (settings.aiEnabled) {
    void processSession(session.id, {
      clean: settings.cleanEnabled,
      summary: settings.summaryEnabled,
    })
  }
}

/**
 * Runs the AI step for a stored session. Only the requested parts are replaced;
 * the raw transcript is read and never written.
 */
export async function processSession(sessionId: string, parts: ProcessingParts): Promise<void> {
  const session = findSession(sessionId)
  if (!session || session.rawTranscript.length === 0) return
  if (sessionsStore.getState().processing[sessionId]) return

  setProcessing(sessionId, parts)
  updateSession(sessionId, () => ({ status: 'processing' }))
  try {
    const result = await aiProcessor.process(session.rawTranscript, {
      ...parts,
      title: session.title === null,
    })
    updateSession(sessionId, (current) => ({
      cleanTranscript: result.cleanTranscript ?? current.cleanTranscript,
      summary: result.summary ?? current.summary,
      title: result.title ?? current.title,
      cost: addCosts(current.cost, result.cost),
      updatedAt: new Date().toISOString(),
    }))
    notify('ai-finished')
  } catch {
    notify('ai-failed')
  } finally {
    updateSession(sessionId, () => ({ status: 'done' }))
    setProcessing(sessionId, null)
  }
}

/** Opens a stored session in the main view. Ignored while a recording is running. */
export function selectSession(sessionId: string): void {
  if (isBusy(recordingStore.getState().phase)) return
  dispatchRecording({ type: 'RESET' })
  sessionsStore.setState({ activeSessionId: sessionId })
  uiStore.setState({ version: 'raw', railOpen: false })
}

export function selectProvider(providerId: string): void {
  const provider = providers.get(providerId)
  if (!provider) return
  updateSettings({ sttProviderId: provider.id, sttModel: provider.models[0]?.id ?? '' })
}

/** The way out of a cloud failure: continue the work with the offline engine. */
export function switchToLocalAndRetry(): void {
  const local = providers.list().find((provider) => provider.getCapabilities().offline)
  if (!local) return
  selectProvider(local.id)
  startRecording()
}
