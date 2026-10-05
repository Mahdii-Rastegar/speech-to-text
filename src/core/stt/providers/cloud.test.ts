import { describe, expect, it } from 'vitest'
import { encodeWav } from '../../audio/pcm'
import type {
  CloudAccess,
  CloudProviderId,
  CloudRequest,
  CloudResponse,
} from '../../cloud/transport'
import { AppFailure } from '../../errors'
import { toBase64 } from '../../util/base64'
import type { AudioInput, TranscribeOptions } from '../provider'
import { createCloudSttProvider } from './cloud'

/** A cloud that answers every request the same way and remembers what it was asked. */
function fakeCloud(status: number, body: unknown, hasKey = true) {
  const sent: { provider: CloudProviderId; request: CloudRequest }[] = []
  const access: CloudAccess = {
    transport: {
      send(provider, request): Promise<CloudResponse> {
        sent.push({ provider, request })
        return Promise.resolve({
          status,
          body: typeof body === 'string' ? body : JSON.stringify(body),
        })
      },
    },
    keys: {
      has: () => Promise.resolve(hasKey),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
  }
  return { access, sent }
}

/** Two seconds of a quiet tone at the capture rate. */
const clip: AudioInput = {
  kind: 'pcm',
  sampleRate: 16_000,
  samples: Float32Array.from({ length: 32_000 }, (_, index) => Math.sin(index / 10) * 0.1),
}

const options: TranscribeOptions = { model: 'openai/whisper-large-v3', language: 'fa' }

/** Base64 text back as bytes. */
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

const kindOf = async (work: Promise<unknown>) => {
  try {
    await work
  } catch (cause) {
    return cause instanceof AppFailure ? cause.appError.kind : 'not-an-app-failure'
  }
  return 'resolved'
}

describe('encodeWav', () => {
  it('writes a 16-bit mono file with the samples after a 44-byte header', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16_000)
    const view = new DataView(wav.buffer)
    const text = (from: number, to: number) => String.fromCharCode(...wav.subarray(from, to))

    expect(wav.length).toBe(44 + 8)
    expect(text(0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(wav.length - 8)
    expect(text(8, 16)).toBe('WAVEfmt ')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(text(36, 40)).toBe('data')
    expect(view.getUint32(40, true)).toBe(8)
    expect([44, 46, 48, 50].map((offset) => view.getInt16(offset, true))).toEqual([
      0, 32767, -32767, 16384,
    ])
  })
})

describe('toBase64', () => {
  it('encodes bytes of any length, across its internal chunks', () => {
    expect(toBase64(new Uint8Array([]))).toBe('')
    expect(toBase64(new TextEncoder().encode('hello'))).toBe('aGVsbG8=')
    const large = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256)
    expect(fromBase64(toBase64(large))).toEqual(large)
  })
})

describe('createCloudSttProvider', () => {
  it('sends OpenRouter a WAV clip and reports the amount it charged', async () => {
    const { access, sent } = fakeCloud(200, { text: ' سلام دنیا ', usage: { cost: 0.0003 } })
    const result = await createCloudSttProvider('openrouter', access).transcribe(clip, {
      ...options,
      prompt: 'API, Deploy',
    })

    expect(result).toEqual({
      segments: [{ id: 'openrouter-1', text: 'سلام دنیا', startMs: 0, endMs: 2000 }],
      durationMs: 2000,
      cost: { amountUsd: 0.0003, estimated: false },
    })
    expect(sent[0]?.provider).toBe('openrouter')
    expect(sent[0]?.request.path).toBe('/audio/transcriptions')
    const body = sent[0]?.request.body as {
      input_audio: { data: string; format: string }
    }
    expect(body).toMatchObject({
      model: 'openai/whisper-large-v3',
      language: 'fa',
      provider: { options: { groq: { prompt: 'API, Deploy' }, openai: { prompt: 'API, Deploy' } } },
    })
    expect(body.input_audio.format).toBe('wav')
    const wav = fromBase64(body.input_audio.data)
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(wav.length).toBe(44 + 64_000)
  })

  it('leaves the language and the hint out when there are none', async () => {
    const { access, sent } = fakeCloud(200, { text: 'hi' })
    await createCloudSttProvider('openrouter', access).transcribe(clip, {
      model: 'openai/whisper-large-v3',
      language: 'auto',
    })
    expect(sent[0]?.request.body).not.toHaveProperty('language')
    expect(sent[0]?.request.body).not.toHaveProperty('provider')
  })

  it('treats empty text as silence, not as a failure', async () => {
    const { access } = fakeCloud(200, { text: '  ' })
    const result = await createCloudSttProvider('openrouter', access).transcribe(clip, options)
    expect(result.segments).toEqual([])
    expect(result.cost).toBeNull()
  })

  it('asks Gemini to transcribe and prices the alias as the model that answered', async () => {
    const { access, sent } = fakeCloud(200, {
      modelVersion: 'gemini-2.5-flash',
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: 'hmm', thought: true }, { text: 'سلام ' }, { text: 'API' }] },
        },
      ],
      usageMetadata: {
        promptTokenCount: 264,
        candidatesTokenCount: 10,
        thoughtsTokenCount: 30,
        promptTokensDetails: [
          { modality: 'TEXT', tokenCount: 200 },
          { modality: 'AUDIO', tokenCount: 64 },
        ],
      },
    })
    const result = await createCloudSttProvider('google', access).transcribe(clip, {
      model: 'gemini-flash-latest',
      language: 'auto',
      prompt: 'Deploy',
    })

    expect(result.segments.map((segment) => segment.text)).toEqual(['سلام API'])
    expect(result.cost?.estimated).toBe(true)
    expect(result.cost?.amountUsd).toBeCloseTo((200 * 0.3 + 64 * 1 + 40 * 2.5) / 1e6, 12)

    expect(sent[0]?.request.path).toBe('/models/gemini-flash-latest:generateContent')
    const body = sent[0]?.request.body as {
      systemInstruction: { parts: { text: string }[] }
      contents: { parts: { inlineData?: { mimeType: string; data: string } }[] }[]
    }
    expect(body.systemInstruction.parts[0]?.text).toContain('Deploy')
    expect(body.contents[0]?.parts[0]?.inlineData?.mimeType).toBe('audio/wav')
  })

  it('reads a Gemini answer without text as silence and shows no cost for unknown models', async () => {
    const { access } = fakeCloud(200, {
      modelVersion: 'gemini-9-ultra',
      candidates: [{ finishReason: 'STOP', content: {} }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 },
    })
    const result = await createCloudSttProvider('google', access).transcribe(clip, {
      model: 'gemini-flash-latest',
      language: 'fa',
    })
    expect(result.segments).toEqual([])
    expect(result.cost).toBeNull()
  })

  it('turns error answers into the app’s own errors', async () => {
    const transcribe = (service: CloudProviderId, status: number, body: unknown) =>
      kindOf(
        createCloudSttProvider(service, fakeCloud(status, body).access).transcribe(clip, options),
      )

    expect(await transcribe('openrouter', 401, { error: { message: 'No auth' } })).toBe(
      'invalid-api-key',
    )
    expect(
      await transcribe('openrouter', 402, { error: { message: 'Insufficient credits' } }),
    ).toBe('no-credit')
    expect(await transcribe('google', 403, '<html>denied</html>')).toBe('provider-blocked')
    expect(
      await transcribe('openrouter', 200, { error: { code: 429, message: 'Slow down' } }),
    ).toBe('rate-limited')
    expect(await transcribe('openrouter', 200, 'not json')).toBe('provider-unavailable')
    expect(await transcribe('openrouter', 200, { usage: {} })).toBe('provider-unavailable')
    expect(await transcribe('google', 200, { promptFeedback: { blockReason: 'SAFETY' } })).toBe(
      'provider-unavailable',
    )
  })

  it('refuses to start without a stored key', async () => {
    const without = createCloudSttProvider('openrouter', fakeCloud(200, {}, false).access)
    expect((await without.validateConfiguration()).error?.kind).toBe('missing-api-key')
    const withKey = createCloudSttProvider('openrouter', fakeCloud(200, {}).access)
    expect(await withKey.validateConfiguration()).toEqual({ ok: true })
  })

  it('drops the answer of a request that was cancelled meanwhile', async () => {
    const cancel = new AbortController()
    const { access } = fakeCloud(200, { text: 'late' })
    const work = createCloudSttProvider('openrouter', access).transcribe(
      clip,
      options,
      cancel.signal,
    )
    cancel.abort()
    await expect(work).rejects.toThrow()
  })

  it('is a paid batch engine that needs the network', () => {
    const provider = createCloudSttProvider('google', fakeCloud(200, {}).access)
    expect(provider.getCapabilities()).toMatchObject({
      mode: 'batch',
      offline: false,
      billing: 'per-audio-second',
    })
    expect(provider.models[0]?.id).toBe('gemini-flash-latest')
    expect(provider.estimateCost(60, 'gemini-flash-latest')).toBeNull()
  })
})
