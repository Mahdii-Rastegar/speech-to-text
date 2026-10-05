import { createResampler } from '@/core/audio/resample'
import { createAppError, type AppError } from '@/core/errors'
import captureWorkletUrl from './captureWorklet.js?url&no-inline'

/** What every speech engine in this app is fed: 16 kHz, mono, samples in -1..1. */
export const CAPTURE_SAMPLE_RATE = 16_000

export interface MicrophoneCapture {
  /** Receives captured audio at `CAPTURE_SAMPLE_RATE`. Returns the unsubscribe function. */
  onAudio(listener: (samples: Float32Array) => void): () => void
  /** Called if the microphone goes away while capturing (unplugged, taken by the system). */
  onEnded(listener: (error: AppError) => void): () => void
  /** Releases the microphone. Safe to call more than once. */
  stop(): void
}

export type OpenMicrophoneResult =
  | {
      ok: true
      capture: MicrophoneCapture
      /** The requested microphone is gone, so the system default was opened instead. */
      usedDefault: boolean
    }
  | { ok: false; error: AppError }

/** The requested device does not exist (any more), as opposed to being refused or busy. */
const isMissingDevice = (cause: unknown) =>
  cause instanceof Error &&
  (cause.name === 'OverconstrainedError' || cause.name === 'NotFoundError')

function toAppError(cause: unknown): AppError {
  const name = cause instanceof DOMException || cause instanceof Error ? cause.name : ''
  const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : undefined
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return createAppError('mic-permission-denied', detail)
    case 'NotReadableError':
    case 'AbortError':
      return createAppError('mic-busy', detail)
    case 'NotFoundError':
    case 'OverconstrainedError':
      return createAppError('mic-unavailable', detail)
    default:
      return createAppError('unknown', detail)
  }
}

/**
 * Asks for the microphone and starts capturing. Call it straight from a click
 * or tap: browsers only allow audio to start from a user action. Audio stays
 * in memory on this device; nothing here stores or sends it.
 *
 * `deviceId` picks a microphone; without it the system default is used. A chosen
 * microphone that has been unplugged falls back to the default.
 */
export async function openMicrophone(deviceId = ''): Promise<OpenMicrophoneResult> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
    // Browsers hide the microphone API on pages that are not served securely.
    return {
      ok: false,
      error: createAppError(
        'mic-unavailable',
        'Microphone capture is not available in this context',
      ),
    }
  }

  // Created before the first await, while the click still counts as a user action.
  const context = new AudioContext({ latencyHint: 'interactive' })
  let stream: MediaStream | undefined
  let usedDefault = false

  const request = (id: string) =>
    navigator.mediaDevices.getUserMedia({
      audio: {
        ...(id ? { deviceId: { exact: id } } : {}),
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })

  try {
    try {
      stream = await request(deviceId)
    } catch (cause) {
      if (!deviceId || !isMissingDevice(cause)) throw cause
      stream = await request('')
      usedDefault = true
    }
    await context.audioWorklet.addModule(captureWorkletUrl)
    await context.resume()
  } catch (cause) {
    stream?.getTracks().forEach((track) => track.stop())
    void context.close()
    return { ok: false, error: toAppError(cause) }
  }

  const audioListeners = new Set<(samples: Float32Array) => void>()
  const endedListeners = new Set<(error: AppError) => void>()
  const resampler = createResampler(context.sampleRate, CAPTURE_SAMPLE_RATE)

  const source = context.createMediaStreamSource(stream)
  const worklet = new AudioWorkletNode(context, 'capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
  })
  // Browsers only run nodes that lead to the output, so the chain ends in a muted
  // gain: the audio is processed but never played back.
  const mute = context.createGain()
  mute.gain.value = 0
  source.connect(worklet).connect(mute).connect(context.destination)

  worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const samples = resampler.process(event.data)
    if (samples.length > 0) audioListeners.forEach((listener) => listener(samples))
  }

  const tracks = stream.getAudioTracks()
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true
    worklet.port.onmessage = null
    tracks.forEach((track) => {
      track.removeEventListener('ended', onTrackEnded)
      track.stop()
    })
    source.disconnect()
    worklet.disconnect()
    mute.disconnect()
    void context.close()
    audioListeners.clear()
  }

  function onTrackEnded() {
    if (stopped) return
    stop()
    const error = createAppError('mic-unavailable', 'The microphone track ended during capture')
    endedListeners.forEach((listener) => listener(error))
    endedListeners.clear()
  }
  tracks.forEach((track) => track.addEventListener('ended', onTrackEnded))

  return {
    ok: true,
    usedDefault,
    capture: {
      onAudio(listener) {
        audioListeners.add(listener)
        return () => audioListeners.delete(listener)
      },
      onEnded(listener) {
        endedListeners.add(listener)
        return () => endedListeners.delete(listener)
      },
      stop,
    },
  }
}
