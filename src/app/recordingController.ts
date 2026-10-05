import { CAPTURE_SAMPLE_RATE, openMicrophone, type MicrophoneCapture } from '@/audio/microphone'
import { SILENCE_DB } from '@/core/audio/signal'
import { createVad } from '@/core/audio/vad'
import {
  AppFailure,
  createAppError,
  toAppError,
  type AppError,
  type AppErrorKind,
} from '@/core/errors'
import { isBusy } from '@/core/recording/machine'
import {
  addCosts,
  createSessionId,
  type AudioSource,
  type LanguageSetting,
  type TranscriptionSession,
} from '@/core/session'
import type { Settings } from '@/core/settings'
import { createChunkedLiveSession } from '@/core/stt/chunkedLive'
import { transcribeRecording } from '@/core/stt/fileTranscription'
import {
  joinSegments,
  type LiveEvent,
  type LiveSession,
  type STTProvider,
  type TranscriptionResult,
} from '@/core/stt/provider'
import {
  createAiProcessor,
  decodeFile,
  FALLBACK_PROVIDER_ID,
  levelSource,
  providers,
} from './services'
import { inputStore, resetInput } from './stores/inputStore'
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
import { notify, uiStore, type NoticeKind } from './stores/uiStore'

/** Quieter than any open microphone in a real room: the input is muted or disconnected. */
const NO_SIGNAL_DB = SILENCE_DB + 10
/** How long the input must stay that quiet before the user is told. */
const NO_SIGNAL_AFTER_MS = 3000

/** How often a batch engine is asked for the sentence that is still being spoken. */
const INTERIM_EVERY_MS = 1500

interface ActiveRun {
  capture: MicrophoneCapture
  live: LiveSession
  unsubscribe: () => void
  providerId: string
  model: string
  language: LanguageSetting
  createdAt: string
}

let activeRun: ActiveRun | null = null

/** Cancels the file being turned into text; null when none is. */
let fileRun: AbortController | null = null
/** The file of the latest attempt, so "try again" repeats it. Null after a microphone recording. */
let lastFile: Blob | null = null

export function resolveProvider(settings: Settings): STTProvider {
  const provider = providers.get(settings.sttProviderId) ?? providers.get(FALLBACK_PROVIDER_ID)
  if (!provider) throw new Error('No speech-to-text provider is registered')
  return provider
}

export function resolveModel(provider: STTProvider, settings: Settings): string {
  const chosen = provider.models.find((model) => model.id === settings.sttModel)
  return (chosen ?? provider.models[0])?.id ?? ''
}

/** Releases the microphone and everything that was following it. */
function endRun(): void {
  activeRun?.capture.stop()
  activeRun?.unsubscribe()
  activeRun = null
  levelSource.reset()
  resetInput()
}

function failRun(error: AppError): void {
  activeRun?.live.abort()
  endRun()
  dispatchRecording({ type: 'FAILED', error, at: Date.now() })
}

/**
 * Follows the captured audio for the interface: the level for the voice line,
 * whether a voice is being heard, and whether anything is arriving at all.
 */
function createInputMonitor(): (samples: Float32Array) => void {
  const vad = createVad({ sampleRate: CAPTURE_SAMPLE_RATE })
  let quietMs = 0

  return (samples) => {
    levelSource.push(samples)
    vad.process(samples)

    const blockMs = (samples.length / CAPTURE_SAMPLE_RATE) * 1000
    quietMs = vad.levelDb < NO_SIGNAL_DB ? quietMs + blockMs : 0

    const next = { speaking: vad.speaking, noSignal: quietMs >= NO_SIGNAL_AFTER_MS }
    const current = inputStore.getState()
    if (next.noSignal && !current.noSignal) notify('mic-no-signal')
    if (current.speaking !== next.speaking || current.noSignal !== next.noSignal) {
      inputStore.setState(next, true)
    }
  }
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
      failRun(event.error)
      break
  }
}

/** Starts a recording. Must be called from a click or tap, which the microphone request needs. */
export function startRecording(): void {
  void beginRecording()
}

async function beginRecording(): Promise<void> {
  if (isBusy(recordingStore.getState().phase)) return

  const settings = settingsStore.getState()
  const provider = resolveProvider(settings)
  const model = resolveModel(provider, settings)

  lastFile = null
  sessionsStore.setState({ activeSessionId: null })
  uiStore.setState({ version: 'raw' })
  dispatchRecording({ type: 'START_REQUESTED' })

  // Both start inside the click: asking for the microphone later could lose the right to ask.
  const [validation, opened] = await Promise.all([
    provider.validateConfiguration(),
    openMicrophone(settings.microphoneId),
  ])
  if (recordingStore.getState().phase !== 'starting') {
    // The request was dropped while the permission prompt was open.
    if (opened.ok) opened.capture.stop()
    return
  }
  if (!opened.ok) {
    dispatchRecording({ type: 'FAILED', error: opened.error, at: Date.now() })
    return
  }
  const { capture } = opened
  if (!validation.ok) {
    capture.stop()
    dispatchRecording({
      type: 'FAILED',
      error: validation.error ?? createAppError('unknown'),
      at: Date.now(),
    })
    return
  }

  const options = { model, language: settings.language, prompt: settings.glossary }
  let live: LiveSession
  try {
    provider.warmUp?.(model)
    live =
      provider.transcribeStream?.(options) ??
      createChunkedLiveSession(provider, options, CAPTURE_SAMPLE_RATE, {
        // Interim text repeats requests, which is only free on this computer.
        interimEveryMs: provider.getCapabilities().billing === 'none' ? INTERIM_EVERY_MS : null,
      })
  } catch (cause) {
    capture.stop()
    dispatchRecording({ type: 'FAILED', error: toAppError(cause), at: Date.now() })
    return
  }

  const monitorInput = createInputMonitor()
  capture.onAudio((samples) => {
    monitorInput(samples)
    live.pushAudio(samples)
  })
  capture.onEnded(failRun)

  activeRun = {
    capture,
    live,
    unsubscribe: live.onEvent(handleLiveEvent),
    providerId: provider.id,
    model,
    language: settings.language,
    createdAt: new Date().toISOString(),
  }
  dispatchRecording({ type: 'STARTED', at: Date.now() })
  notify(opened.usedDefault ? 'mic-fell-back' : 'recording-started')
}

export async function stopRecording(): Promise<void> {
  const run = activeRun
  if (!run || recordingStore.getState().phase !== 'recording') return

  dispatchRecording({ type: 'STOP_REQUESTED', at: Date.now() })
  // The microphone is released at once; only the text may still be catching up.
  run.capture.stop()
  levelSource.reset()
  resetInput()

  let result: TranscriptionResult
  try {
    result = await run.live.stop()
  } catch (cause) {
    failRun(toAppError(cause))
    return
  }

  endRun()
  dispatchRecording({ type: 'FINALIZED' })

  keepTranscript(result, {
    source: 'microphone',
    providerId: run.providerId,
    model: run.model,
    language: run.language,
    createdAt: run.createdAt,
    saved: 'recording-stopped',
    empty: 'nothing-recorded',
  })
}

interface FinishedRun {
  source: AudioSource
  providerId: string
  model: string
  language: LanguageSetting
  createdAt: string
  /** What the user is told when the text was stored, and when there was none. */
  saved: NoticeKind
  empty: NoticeKind
}

/** Stores what a finished recording or file produced, and starts the AI step if it is on. */
function keepTranscript(result: TranscriptionResult, run: FinishedRun): void {
  const rawTranscript = joinSegments(result.segments)
  if (rawTranscript.length === 0) {
    dispatchRecording({ type: 'RESET' })
    notify(run.empty)
    return
  }

  const session: TranscriptionSession = {
    id: createSessionId(),
    createdAt: run.createdAt,
    updatedAt: new Date().toISOString(),
    durationMs: recordingStore.getState().durationMs,
    language: run.language,
    source: run.source,
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
  notify(run.saved)

  const settings = settingsStore.getState()
  if (settings.aiEnabled) {
    void processSession(session.id, {
      clean: settings.cleanEnabled,
      summary: settings.summaryEnabled,
    })
  }
}

/**
 * Turns an audio file into text with the chosen engine. The file is read on
 * this device; text appears piece by piece and the result is stored like a recording.
 */
export function transcribeFile(file: Blob): void {
  void runFile(file)
}

async function runFile(file: Blob): Promise<void> {
  if (isBusy(recordingStore.getState().phase)) return

  const settings = settingsStore.getState()
  const provider = resolveProvider(settings)
  const model = resolveModel(provider, settings)
  const createdAt = new Date().toISOString()

  const cancel = new AbortController()
  fileRun = cancel
  lastFile = file
  sessionsStore.setState({ activeSessionId: null })
  uiStore.setState({ view: 'main', version: 'raw', railOpen: false })
  dispatchRecording({ type: 'START_REQUESTED', source: 'file' })

  let result: TranscriptionResult
  try {
    const [validation, samples] = await Promise.all([
      provider.validateConfiguration(),
      decodeFile(file),
    ])
    if (cancel.signal.aborted) return
    if (!validation.ok) throw new AppFailure(validation.error ?? createAppError('unknown'))

    provider.warmUp?.(model)
    dispatchRecording({
      type: 'FILE_READY',
      durationMs: Math.round((samples.length / CAPTURE_SAMPLE_RATE) * 1000),
    })
    result = await transcribeRecording(
      provider,
      samples,
      CAPTURE_SAMPLE_RATE,
      { model, language: settings.language, prompt: settings.glossary },
      {
        onSegment: (segment) => dispatchRecording({ type: 'FINAL', segment }),
        onProgress: (fraction) => dispatchRecording({ type: 'PROGRESS', fraction }),
      },
      cancel.signal,
    )
  } catch (cause) {
    // A cancelled run has already left the screen; whatever it throws afterwards is not news.
    if (cancel.signal.aborted) return
    fileRun = null
    dispatchRecording({ type: 'FAILED', error: toAppError(cause), at: Date.now() })
    return
  }

  fileRun = null
  dispatchRecording({ type: 'FINALIZED' })
  keepTranscript(result, {
    source: 'file',
    providerId: provider.id,
    model,
    language: settings.language,
    createdAt,
    saved: 'file-finished',
    empty: 'file-no-speech',
  })
}

/** Gives up on the file being turned into text. Nothing of it is stored. */
export function cancelFile(): void {
  if (!fileRun) return
  fileRun.abort()
  fileRun = null
  dispatchRecording({ type: 'RESET' })
  notify('file-cancelled')
}

/** Repeats the latest attempt: the same file again, or a new recording. */
export function retry(): void {
  if (lastFile) transcribeFile(lastFile)
  else startRecording()
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
    const processor = createAiProcessor(settingsStore.getState())
    const result = await processor.process(session.rawTranscript, {
      ...parts,
      title: session.title === null,
    })
    // What did come back is kept, and paid for, even when another part failed.
    updateSession(sessionId, (current) => ({
      cleanTranscript: result.cleanTranscript ?? current.cleanTranscript,
      summary: result.summary ?? current.summary,
      title: result.title ?? current.title,
      cost: addCosts(current.cost, result.cost),
      updatedAt: new Date().toISOString(),
    }))
    if (result.error) notify('ai-failed', result.error.kind)
    else notify('ai-finished')
  } catch (cause) {
    notify('ai-failed', toAppError(cause).kind)
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
  uiStore.setState({ view: 'main', version: 'raw', railOpen: false })
}

/** Demo only: puts the main view into a chosen failure state so its message can be reviewed. */
export function previewError(kind: AppErrorKind): void {
  if (isBusy(recordingStore.getState().phase)) return
  lastFile = null
  sessionsStore.setState({ activeSessionId: null })
  dispatchRecording({ type: 'START_REQUESTED' })
  dispatchRecording({ type: 'FAILED', error: createAppError(kind), at: Date.now() })
  uiStore.setState({ view: 'main', version: 'raw', railOpen: false })
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
  retry()
}
