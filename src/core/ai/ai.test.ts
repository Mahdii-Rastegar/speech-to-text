import { describe, expect, it } from 'vitest'
import type { CloudRequest, CloudResponse, CloudTransport } from '../cloud/transport'
import { AppFailure, createAppError } from '../errors'
import { checkKey, createChatClient, type ChatClient, type ChatRequest } from './chat'
import { createChatAIProcessor } from './providers/chat'

/** A transport that answers every request the same way and remembers what it was asked. */
function fakeTransport(status: number, body: unknown) {
  const sent: CloudRequest[] = []
  const transport: CloudTransport = {
    send(_provider, request): Promise<CloudResponse> {
      sent.push(request)
      return Promise.resolve({
        status,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      })
    },
  }
  return { transport, sent }
}

const ask: ChatRequest = { model: 'vendor/model-1', system: 'Do it.', user: 'سلام' }

describe('createChatClient', () => {
  it('speaks OpenRouter’s format and reports the amount it charged', async () => {
    const { transport, sent } = fakeTransport(200, {
      choices: [{ finish_reason: 'stop', message: { content: 'سلام.' } }],
      usage: { cost: 0.00042 },
    })
    const reply = await createChatClient('openrouter', transport).complete(ask)

    expect(reply).toEqual({ text: 'سلام.', cost: { amountUsd: 0.00042, estimated: false } })
    expect(sent[0]?.path).toBe('/chat/completions')
    expect(sent[0]?.body).toMatchObject({
      model: 'vendor/model-1',
      messages: [
        { role: 'system', content: 'Do it.' },
        { role: 'user', content: 'سلام' },
      ],
    })
  })

  it('speaks Google’s format, skips the model’s thoughts and estimates the cost', async () => {
    const { transport, sent } = fakeTransport(200, {
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [{ text: 'thinking…', thought: true }, { text: 'سلام' }, { text: '.' }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 300 },
    })
    const reply = await createChatClient('google', transport).complete({
      ...ask,
      model: 'gemini-2.5-flash',
    })

    expect(reply.text).toBe('سلام.')
    expect(reply.cost?.estimated).toBe(true)
    expect(reply.cost?.amountUsd).toBeCloseTo((1000 * 0.3 + 500 * 2.5) / 1e6, 10)
    expect(sent[0]?.path).toBe('/models/gemini-2.5-flash:generateContent')
    expect(sent[0]?.body).toMatchObject({
      systemInstruction: { parts: [{ text: 'Do it.' }] },
      contents: [{ role: 'user', parts: [{ text: 'سلام' }] }],
    })
  })

  it('shows no cost for a Google model whose price it does not know', async () => {
    const { transport } = fakeTransport(200, {
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 },
    })
    const reply = await createChatClient('google', transport).complete({
      ...ask,
      model: 'gemini-flash-latest',
    })
    expect(reply.cost).toBeNull()
  })

  const failure = async (run: Promise<unknown>) => {
    const cause = await run.then(
      () => null,
      (error: unknown) => error,
    )
    expect(cause).toBeInstanceOf(AppFailure)
    return (cause as AppFailure).appError
  }

  it('turns error statuses into app errors', async () => {
    const { transport } = fakeTransport(401, { error: { message: 'No auth credentials found' } })
    const error = await failure(createChatClient('openrouter', transport).complete(ask))
    expect(error.kind).toBe('invalid-api-key')
  })

  it('reads a failure that OpenRouter reports inside a successful answer', async () => {
    const { transport } = fakeTransport(200, { error: { code: 429, message: 'Rate limited' } })
    const error = await failure(createChatClient('openrouter', transport).complete(ask))
    expect(error.kind).toBe('rate-limited')
  })

  it('refuses an answer that was cut off or is empty', async () => {
    const cut = fakeTransport(200, {
      choices: [{ finish_reason: 'length', message: { content: 'half a sent' } }],
    })
    expect(
      (await failure(createChatClient('openrouter', cut.transport).complete(ask))).detail,
    ).toBe('The answer was cut off')

    const blocked = fakeTransport(200, { promptFeedback: { blockReason: 'SAFETY' } })
    const error = await failure(
      createChatClient('google', blocked.transport).complete({ ...ask, model: 'gemini-x' }),
    )
    expect(error.kind).toBe('provider-unavailable')
    expect(error.detail).toContain('SAFETY')
  })

  it('never sends something that is not a model id', async () => {
    const { transport, sent } = fakeTransport(200, {})
    const client = createChatClient('google', transport)
    for (const model of ['', '../key', 'a b', 'x?key=1', 'm:generateContent/../../y']) {
      expect((await failure(client.complete({ ...ask, model }))).kind).toBe('model-unavailable')
    }
    expect(sent).toHaveLength(0)
  })
})

describe('checkKey', () => {
  it('accepts a key the service accepts', async () => {
    const { transport, sent } = fakeTransport(200, { data: {} })
    expect(await checkKey('openrouter', transport)).toBeNull()
    expect(sent[0]).toEqual({ method: 'GET', path: '/key' })
  })

  it('says why a key does not work', async () => {
    const rejected = fakeTransport(400, {
      error: { status: 'INVALID_ARGUMENT', message: 'API key not valid.' },
    })
    expect((await checkKey('google', rejected.transport))?.kind).toBe('invalid-api-key')

    const blocked = fakeTransport(403, '<html>Forbidden</html>')
    expect((await checkKey('openrouter', blocked.transport))?.kind).toBe('provider-blocked')

    const offline: CloudTransport = {
      send: () => Promise.reject(new AppFailure(createAppError('offline'))),
    }
    expect((await checkKey('google', offline))?.kind).toBe('offline')
  })
})

describe('createChatAIProcessor', () => {
  /** Answers by task, recognized from the instructions. */
  function fakeClient(answers: { clean?: string; summary?: string; title?: string }) {
    const requests: ChatRequest[] = []
    const client: ChatClient = {
      complete(request) {
        requests.push(request)
        const task = request.system.includes('Rewrite the transcript')
          ? 'clean'
          : request.system.includes('Summarize')
            ? 'summary'
            : 'title'
        const text = answers[task]
        if (text === undefined) {
          return Promise.reject(new AppFailure(createAppError('rate-limited')))
        }
        return Promise.resolve({ text, cost: { amountUsd: 0.001, estimated: false } })
      },
    }
    return { client, requests }
  }

  const config = { model: 'vendor/model-1', glossary: 'Tauri, deploy' }

  it('asks only for the requested parts and adds up their cost', async () => {
    const { client, requests } = fakeClient({ clean: 'متن پاک.', title: 'عنوان' })
    const result = await createChatAIProcessor(client, config).process('متن خام', {
      clean: true,
      summary: false,
      title: true,
    })

    expect(result).toEqual({
      cleanTranscript: 'متن پاک.',
      summary: null,
      title: 'عنوان',
      cost: { amountUsd: 0.002, estimated: false },
      error: null,
    })
    expect(requests).toHaveLength(2)
    expect(
      requests.every((request) => request.user === '<transcript>\nمتن خام\n</transcript>'),
    ).toBe(true)
    expect(requests[0]?.system).toContain('Tauri, deploy')
  })

  it('tidies what models add around their answer', async () => {
    const { client } = fakeClient({
      clean: '```\n<transcript>\nمتن پاک.\n</transcript>\n```',
      summary: '  خلاصه.  ',
      title: '«جلسه‌ی برنامه‌ریزی deploy».\nخط اضافه',
    })
    const result = await createChatAIProcessor(client, config).process('متن', {
      clean: true,
      summary: true,
      title: true,
    })
    expect(result.cleanTranscript).toBe('متن پاک.')
    expect(result.summary).toBe('خلاصه.')
    expect(result.title).toBe('جلسه‌ی برنامه‌ریزی deploy')
  })

  it('keeps the parts that worked when another fails', async () => {
    const { client } = fakeClient({ clean: 'متن پاک.' })
    const result = await createChatAIProcessor(client, config).process('متن', {
      clean: true,
      summary: true,
      title: false,
    })
    expect(result.cleanTranscript).toBe('متن پاک.')
    expect(result.summary).toBeNull()
    expect(result.error?.kind).toBe('rate-limited')
    expect(result.cost).toEqual({ amountUsd: 0.001, estimated: false })
  })
})
