import { errorFromResponse } from '../cloud/errors'
import type { CloudProviderId, CloudRequest, CloudTransport } from '../cloud/transport'
import { AppFailure, createAppError, type AppError } from '../errors'
import type { CostInfo } from '../session'

/** Used when the user has not named a model. Any model id of the service can be typed in Settings. */
export const DEFAULT_AI_MODELS: Record<CloudProviderId, string> = {
  openrouter: 'google/gemini-2.5-flash',
  google: 'gemini-flash-latest',
}

/** Low, so the same recording gives the same text and the model does not get creative. */
const TEMPERATURE = 0.2

/**
 * Google's list prices in dollars per million tokens (input, output), as they
 * were when this was written. Google reports tokens, not money, so the cost of
 * a model that is not listed here is simply not shown. OpenRouter reports the
 * amount it charged, which needs no table.
 */
const GOOGLE_USD_PER_MILLION: Record<string, readonly [number, number]> = {
  'gemini-2.5-flash': [0.3, 2.5],
  'gemini-2.5-flash-lite': [0.1, 0.4],
}

export interface ChatRequest {
  model: string
  /** What the model is asked to do. */
  system: string
  /** The text it is asked to do it to. */
  user: string
}

export interface ChatReply {
  text: string
  cost: CostInfo | null
}

/** One question, one answer, in plain text. Rejects with an AppFailure. */
export interface ChatClient {
  complete(request: ChatRequest): Promise<ChatReply>
}

interface Dialect {
  request(chat: ChatRequest): CloudRequest
  /** Reads a successful answer; throws an AppFailure when it holds no usable text. */
  reply(body: unknown, model: string): ChatReply
  /** A cheap request that only a working key gets through. */
  keyCheck: CloudRequest
}

const fail = (kind: AppError['kind'], detail: string) =>
  new AppFailure(createAppError(kind, detail))

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const openrouter: Dialect = {
  request: ({ model, system, user }) => ({
    method: 'POST',
    path: '/chat/completions',
    body: {
      model,
      temperature: TEMPERATURE,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  }),
  reply(body) {
    const answer = body as {
      error?: { message?: unknown; code?: unknown }
      choices?: { finish_reason?: unknown; message?: { content?: unknown } }[]
      usage?: { cost?: unknown }
    }
    // OpenRouter passes on a failure of the model's host inside a successful answer.
    if (answer.error) {
      const status = number(answer.error.code) ?? 502
      throw new AppFailure(errorFromResponse({ status, body: JSON.stringify(answer) }))
    }
    const choice = answer.choices?.[0]
    const text = choice?.message?.content
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw fail('provider-unavailable', 'The model returned no text')
    }
    if (choice?.finish_reason === 'length') throw fail('unknown', 'The answer was cut off')
    const amountUsd = number(answer.usage?.cost)
    return { text, cost: amountUsd === null ? null : { amountUsd, estimated: false } }
  },
  keyCheck: { method: 'GET', path: '/key' },
}

const google: Dialect = {
  request: ({ model, system, user }) => ({
    method: 'POST',
    path: `/models/${model}:generateContent`,
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: TEMPERATURE },
    },
  }),
  reply(body, model) {
    const answer = body as {
      promptFeedback?: { blockReason?: unknown }
      candidates?: {
        finishReason?: unknown
        content?: { parts?: { text?: unknown; thought?: unknown }[] }
      }[]
      usageMetadata?: {
        promptTokenCount?: unknown
        candidatesTokenCount?: unknown
        thoughtsTokenCount?: unknown
      }
    }
    const candidate = answer.candidates?.[0]
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => part.thought !== true && typeof part.text === 'string')
      .map((part) => part.text)
      .join('')
    if (text.trim().length === 0) {
      const reason = answer.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'no text'
      throw fail('provider-unavailable', `The model returned no text (${String(reason)})`)
    }
    if (candidate?.finishReason === 'MAX_TOKENS') throw fail('unknown', 'The answer was cut off')

    const price = GOOGLE_USD_PER_MILLION[model]
    const usage = answer.usageMetadata
    const input = number(usage?.promptTokenCount)
    const output = number(usage?.candidatesTokenCount)
    if (!price || input === null || output === null) return { text, cost: null }
    const billedOutput = output + (number(usage?.thoughtsTokenCount) ?? 0)
    return {
      text,
      cost: { amountUsd: (input * price[0] + billedOutput * price[1]) / 1e6, estimated: true },
    }
  },
  keyCheck: { method: 'GET', path: '/models' },
}

const DIALECTS: Record<CloudProviderId, Dialect> = { openrouter, google }

/** A model id is put into the request as it is, so it may only look like one. */
const MODEL_ID = /^[\w.~-]+(?:[/:][\w.~-]+)*$/

export function createChatClient(provider: CloudProviderId, transport: CloudTransport): ChatClient {
  const dialect = DIALECTS[provider]
  return {
    async complete(request) {
      if (!MODEL_ID.test(request.model) || request.model.includes('..')) {
        throw fail('model-unavailable', `Not a model id: ${request.model}`)
      }
      const response = await transport.send(provider, dialect.request(request))
      if (response.status < 200 || response.status >= 300) {
        throw new AppFailure(errorFromResponse(response))
      }
      let body: unknown
      try {
        body = JSON.parse(response.body)
      } catch {
        throw fail('provider-unavailable', 'The answer was not JSON')
      }
      return dialect.reply(body, request.model)
    },
  }
}

/** Asks the service whether the stored key works. Null means it does. */
export async function checkKey(
  provider: CloudProviderId,
  transport: CloudTransport,
): Promise<AppError | null> {
  try {
    const response = await transport.send(provider, DIALECTS[provider].keyCheck)
    return response.status >= 200 && response.status < 300 ? null : errorFromResponse(response)
  } catch (cause) {
    return cause instanceof AppFailure ? cause.appError : createAppError('unknown')
  }
}
