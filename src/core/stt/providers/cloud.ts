import { encodeWav } from '../../audio/pcm'
import { errorFromResponse } from '../../cloud/errors'
import type { CloudAccess, CloudProviderId, CloudRequest } from '../../cloud/transport'
import { AppFailure, createAppError } from '../../errors'
import type { CostInfo, LanguageSetting } from '../../session'
import { toBase64 } from '../../util/base64'
import type { ModelInfo, STTProvider, TranscribeOptions } from '../provider'

/** What a service heard in one clip. Empty text means it heard no speech. */
interface Heard {
  text: string
  cost: CostInfo | null
}

interface Dialect {
  /** The first one is used until the user picks another. */
  models: readonly ModelInfo[]
  request(wavBase64: string, options: TranscribeOptions): CloudRequest
  /** Reads a successful answer; throws an AppFailure when it is not one after all. */
  reply(body: unknown, model: string): Heard
}

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * Hosts that take a spelling hint, by the name OpenRouter knows them under.
 * The hint is sent for all of them; only the host that serves the request
 * receives its own, and the other hosts of a model simply go without.
 */
const HOSTS_WITH_PROMPT = ['groq', 'openai'] as const

const openrouter: Dialect = {
  models: [
    { id: 'openai/whisper-large-v3' },
    { id: 'openai/whisper-large-v3-turbo' },
    { id: 'openai/gpt-4o-transcribe' },
    { id: 'openai/gpt-4o-mini-transcribe' },
    { id: 'google/gemini-3.5-transcribe' },
  ],
  request: (wavBase64, { model, language, prompt }) => ({
    method: 'POST',
    path: '/audio/transcriptions',
    body: {
      model,
      input_audio: { data: wavBase64, format: 'wav' },
      temperature: 0,
      ...(language === 'auto' ? {} : { language }),
      ...(prompt
        ? {
            provider: {
              options: Object.fromEntries(HOSTS_WITH_PROMPT.map((host) => [host, { prompt }])),
            },
          }
        : {}),
    },
  }),
  reply(body) {
    const answer = body as {
      error?: { code?: unknown }
      text?: unknown
      usage?: { cost?: unknown }
    }
    // OpenRouter passes on a failure of the model's host inside a successful answer.
    if (answer.error) {
      const status = number(answer.error.code) ?? 502
      throw new AppFailure(errorFromResponse({ status, body: JSON.stringify(answer) }))
    }
    if (typeof answer.text !== 'string') {
      throw new AppFailure(createAppError('provider-unavailable', 'The answer held no text'))
    }
    const amountUsd = number(answer.usage?.cost)
    return {
      text: answer.text,
      cost: amountUsd === null ? null : { amountUsd, estimated: false },
    }
  },
}

/**
 * Google's list prices in dollars per million tokens (text in, audio in, out),
 * as they were when this was written. Google reports tokens, not money, so the
 * cost of a model that is not listed here is simply not shown.
 */
const GOOGLE_USD_PER_MILLION: Record<string, readonly [number, number, number]> = {
  'gemini-2.5-flash': [0.3, 1, 2.5],
  'gemini-2.5-flash-lite': [0.1, 0.3, 0.4],
}

const SPOKEN: Record<LanguageSetting, string> = {
  auto: 'The speech is Persian, English, or Persian with English terms mixed in.',
  fa: 'The speech is Persian, possibly with English terms mixed in.',
  en: 'The speech is English.',
}

/** Gemini is a chat model: it transcribes because it is told to, so it is told precisely. */
function googleInstruction(language: LanguageSetting, prompt: string | undefined): string {
  return [
    'You are a speech-to-text engine. Write down exactly what is said in the recording, word for word.',
    SPOKEN[language],
    'Write Persian in Persian script and English words in Latin script. Do not translate, summarize, correct or answer what is said.',
    'Output only the transcript: no timestamps, no speaker names, no notes, no quotation marks.',
    'If the recording holds no intelligible speech, output nothing at all.',
    prompt
      ? `Words the speaker tends to use, followed by what was said just before this recording, as a spelling aid only. Never copy it into the output:\n${prompt}`
      : '',
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}

const google: Dialect = {
  models: [{ id: 'gemini-flash-latest' }, { id: 'gemini-flash-lite-latest' }],
  request: (wavBase64, { model, language, prompt }) => ({
    method: 'POST',
    path: `/models/${model}:generateContent`,
    body: {
      systemInstruction: { parts: [{ text: googleInstruction(language, prompt) }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
            { text: 'Transcribe this recording.' },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    },
  }),
  reply(body, model) {
    const answer = body as {
      promptFeedback?: { blockReason?: unknown }
      modelVersion?: unknown
      candidates?: {
        finishReason?: unknown
        content?: { parts?: { text?: unknown; thought?: unknown }[] }
      }[]
      usageMetadata?: {
        promptTokenCount?: unknown
        candidatesTokenCount?: unknown
        thoughtsTokenCount?: unknown
        promptTokensDetails?: { modality?: unknown; tokenCount?: unknown }[]
      }
    }
    const blocked = answer.promptFeedback?.blockReason
    if (blocked) {
      throw new AppFailure(
        createAppError('provider-unavailable', `The recording was refused (${String(blocked)})`),
      )
    }
    const candidate = answer.candidates?.[0]
    if (!candidate) {
      throw new AppFailure(createAppError('provider-unavailable', 'The answer held no text'))
    }
    // A candidate without text is the model's way of saying it heard no speech.
    const text = (candidate.content?.parts ?? [])
      .filter((part) => part.thought !== true && typeof part.text === 'string')
      .map((part) => part.text)
      .join('')

    // An alias such as "gemini-flash-latest" is priced as the model that answered.
    const served = typeof answer.modelVersion === 'string' ? answer.modelVersion : model
    const price = GOOGLE_USD_PER_MILLION[served]
    const usage = answer.usageMetadata
    const input = number(usage?.promptTokenCount)
    const output = number(usage?.candidatesTokenCount)
    if (!price || input === null || output === null) return { text, cost: null }
    const audio = (usage?.promptTokensDetails ?? [])
      .filter((detail) => detail.modality === 'AUDIO')
      .reduce((total, detail) => total + (number(detail.tokenCount) ?? 0), 0)
    const billedOutput = output + (number(usage?.thoughtsTokenCount) ?? 0)
    const amountUsd =
      ((input - audio) * price[0] + audio * price[1] + billedOutput * price[2]) / 1e6
    return { text, cost: { amountUsd, estimated: true } }
  },
}

const DIALECTS: Record<CloudProviderId, Dialect> = { openrouter, google }

/**
 * A cloud service as a speech-to-text engine, with the user's own key. It
 * takes one clip per request, so live text comes from cutting the recording
 * at the speaker's pauses, like the local engine. The clip travels as a WAV
 * file inside the JSON request; the key is attached by the platform.
 */
export function createCloudSttProvider(service: CloudProviderId, access: CloudAccess): STTProvider {
  const dialect = DIALECTS[service]
  return {
    id: service,
    kind: 'cloud',
    models: dialect.models,
    getCapabilities: () => ({
      mode: 'batch',
      offline: false,
      languages: ['auto', 'fa', 'en'],
      billing: 'per-audio-second',
    }),
    async validateConfiguration() {
      // A key store that cannot be asked is not proof of a missing key: the request will tell.
      const stored = await access.keys.has(service).catch(() => true)
      return stored ? { ok: true } : { ok: false, error: createAppError('missing-api-key') }
    },
    async transcribe(audio, options, signal) {
      if (audio.kind !== 'pcm') {
        throw new AppFailure(createAppError('unknown', 'Cloud engines take decoded samples'))
      }
      signal?.throwIfAborted()
      const wav = toBase64(encodeWav(audio.samples, audio.sampleRate))
      const response = await access.transport.send(service, dialect.request(wav, options))
      signal?.throwIfAborted()
      if (response.status < 200 || response.status >= 300) {
        throw new AppFailure(errorFromResponse(response))
      }
      let body: unknown
      try {
        body = JSON.parse(response.body)
      } catch {
        throw new AppFailure(createAppError('provider-unavailable', 'The answer was not JSON'))
      }
      const heard = dialect.reply(body, options.model)
      const durationMs = Math.round((audio.samples.length / audio.sampleRate) * 1000)
      const text = heard.text.trim()
      return {
        segments: text ? [{ id: `${service}-1`, text, startMs: 0, endMs: durationMs }] : [],
        durationMs,
        cost: heard.cost,
      }
    },
    // The services bill by tokens or by the host that happens to answer; the real amount comes with each answer.
    estimateCost: () => null,
  }
}
