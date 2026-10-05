import { describe, expect, it } from 'vitest'
import { createDemoAIProcessor } from './ai/providers/demo'
import { createAppError } from './errors'
import { addCosts } from './session'
import { DEFAULT_SETTINGS, parseSettings } from './settings'
import { joinSegments } from './stt/provider'
import { createDemoProvider } from './stt/providers/demo'
import { DEMO_SCRIPT } from './stt/providers/demoScript'
import { createProviderRegistry } from './stt/registry'
import { detectDirection } from './text/direction'

describe('detectDirection', () => {
  it('keeps a Persian sentence right-to-left even when it opens with an English term', () => {
    expect(detectDirection('API رو باید قبل از deploy تست کنم')).toBe('rtl')
    expect(detectDirection('امروز باید روی AI Agent پروژه کار کنم')).toBe('rtl')
  })

  it('lays out English text left-to-right', () => {
    expect(detectDirection('Today I need to test the API before deploying.')).toBe('ltr')
  })

  it('uses the fallback for text too short to judge', () => {
    expect(detectDirection('API')).toBe('rtl')
    expect(detectDirection('API', 'ltr')).toBe('ltr')
    expect(detectDirection('')).toBe('rtl')
  })
})

describe('parseSettings', () => {
  it('returns defaults for anything that is not an object', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values and replaces invalid ones', () => {
    const parsed = parseSettings({
      sttProviderId: 'demo-cloud',
      language: 'klingon',
      microphoneId: 'mic-1',
      aiEnabled: true,
      summaryEnabled: 'yes',
      unknownField: 1,
    })
    expect(parsed).toEqual({
      ...DEFAULT_SETTINGS,
      sttProviderId: 'demo-cloud',
      microphoneId: 'mic-1',
      aiEnabled: true,
    })
    expect(parseSettings({ microphoneId: 7 }).microphoneId).toBe('')
  })
})

describe('provider registry', () => {
  const provider = createDemoProvider({
    id: 'demo-local',
    kind: 'local',
    models: [{ id: 'large-v3-turbo' }],
    usdPerAudioSecond: null,
  })

  it('finds registered providers and rejects duplicates', () => {
    const registry = createProviderRegistry()
    registry.register(provider)
    expect(registry.get('demo-local')).toBe(provider)
    expect(registry.get('missing')).toBeUndefined()
    expect(registry.list()).toEqual([provider])
    expect(() => registry.register(provider)).toThrow(/already registered/)
  })
})

describe('joinSegments', () => {
  it('joins text with single spaces and skips empty segments', () => {
    const segments = [' یک ', '', 'دو'].map((text, index) => ({
      id: String(index),
      text,
      startMs: 0,
      endMs: 0,
    }))
    expect(joinSegments(segments)).toBe('یک دو')
  })
})

describe('errors and costs', () => {
  it('marks cloud failures as recoverable through the local engine', () => {
    expect(createAppError('provider-blocked')).toEqual({
      kind: 'provider-blocked',
      retryable: true,
      canSwitchToLocal: true,
    })
    expect(createAppError('mic-permission-denied').canSwitchToLocal).toBe(false)
  })

  it('adds costs and keeps the estimated flag if any part is estimated', () => {
    expect(addCosts(null, null)).toBeNull()
    expect(addCosts({ amountUsd: 0.001, estimated: false }, null)).toEqual({
      amountUsd: 0.001,
      estimated: false,
    })
    expect(
      addCosts({ amountUsd: 0.001, estimated: false }, { amountUsd: 0.002, estimated: true }),
    ).toEqual({ amountUsd: 0.003, estimated: true })
  })
})

describe('demo AI processor', () => {
  const processor = createDemoAIProcessor({ delayMs: 0 })
  const raw = `${DEMO_SCRIPT[0]!.raw} ${DEMO_SCRIPT[1]!.raw}`

  it('returns a cleaned version without touching the input', async () => {
    const result = await processor.process(raw, { clean: true, summary: true, title: true })
    expect(result.cleanTranscript).toBe(`${DEMO_SCRIPT[0]!.clean} ${DEMO_SCRIPT[1]!.clean}`)
    expect(result.summary).toContain(DEMO_SCRIPT[0]!.gist)
    expect(result.title).not.toBeNull()
    expect(raw).toBe(`${DEMO_SCRIPT[0]!.raw} ${DEMO_SCRIPT[1]!.raw}`)
  })

  it('only produces what was asked for', async () => {
    const result = await processor.process(raw, { clean: true, summary: false, title: false })
    expect(result.cleanTranscript).not.toBeNull()
    expect(result.summary).toBeNull()
    expect(result.title).toBeNull()
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(
      createDemoAIProcessor({ delayMs: 50 }).process(
        raw,
        { clean: true, summary: false, title: false },
        controller.signal,
      ),
    ).rejects.toThrow('cancelled')
  })
})
