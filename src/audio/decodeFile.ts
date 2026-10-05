import { AppFailure, createAppError } from '@/core/errors'
import { CAPTURE_SAMPLE_RATE } from './microphone'

/** The whole file is decoded in memory, so its size is capped. The message in `fa.ts` names this limit. */
const MAX_FILE_BYTES = 300 * 1024 * 1024

/** Another way to decode a file, to 16 kHz mono, for what the browser cannot read. */
export type FileDecoder = (bytes: ArrayBuffer) => Promise<Float32Array>

/**
 * Decodes an audio file (or the sound track of a video) into the format every
 * engine is fed: 16 kHz mono. The browser's own decoder does the work, so the
 * formats are the ones the browser plays, and nothing leaves the device.
 * `fallback` is tried with the files the browser gives up on.
 */
export async function decodeAudioFile(file: Blob, fallback?: FileDecoder): Promise<Float32Array> {
  if (file.size > MAX_FILE_BYTES) throw new AppFailure(createAppError('file-too-large'))

  let decoded: AudioBuffer
  try {
    // Decoding converts to the context's sample rate; the context itself renders nothing.
    const context = new OfflineAudioContext(1, 1, CAPTURE_SAMPLE_RATE)
    decoded = await context.decodeAudioData(await file.arrayBuffer())
  } catch (cause) {
    const unreadable = (reason: unknown) =>
      new AppFailure(
        createAppError(
          'file-unreadable',
          reason instanceof Error ? reason.message : String(reason),
        ),
      )
    if (!fallback) throw unreadable(cause)
    try {
      // Read again: the failed attempt took the first copy of the bytes with it.
      return await fallback(await file.arrayBuffer())
    } catch (fallbackCause) {
      throw unreadable(fallbackCause)
    }
  }

  const mono = decoded.getChannelData(0)
  if (decoded.numberOfChannels === 1) return mono
  const mixed = new Float32Array(mono.length)
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const data = decoded.getChannelData(channel)
    for (let index = 0; index < mixed.length; index++) mixed[index]! += data[index]!
  }
  for (let index = 0; index < mixed.length; index++) mixed[index]! /= decoded.numberOfChannels
  return mixed
}
