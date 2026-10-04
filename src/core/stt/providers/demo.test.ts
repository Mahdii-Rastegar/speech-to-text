import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveEvent } from '../provider'
import { joinSegments } from '../provider'
import { createDemoProvider } from './demo'
import { DEMO_SCRIPT } from './demoScript'

const TIMING = { firstWordDelayMs: 100, wordIntervalMs: 50, sentencePauseMs: 100, finalizeDelayMs: 20 }

const localDemo = () =>
  createDemoProvider({
    id: 'demo-local',
    kind: 'local',
    models: [{ id: 'large-v3-turbo' }],
    usdPerAudioSecond: null,
    ...TIMING,
  })

const firstLine = DEMO_SCRIPT[0]!.raw
const firstLineWords = firstLine.split(' ')

describe('demo provider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports local capabilities and no cost', () => {
    const provider = localDemo()
    expect(provider.getCapabilities()).toMatchObject({ offline: true, billing: 'none' })
    expect(provider.estimateCost(120, 'large-v3-turbo')).toBeNull()
  })

  it('estimates cost for the cloud-styled engine and marks it as estimated', () => {
    const provider = createDemoProvider({
      id: 'demo-cloud',
      kind: 'cloud',
      models: [{ id: 'whisper-large-v3' }],
      usdPerAudioSecond: 0.00001,
    })
    expect(provider.getCapabilities()).toMatchObject({ offline: false, billing: 'per-audio-second' })
    expect(provider.estimateCost(100, 'whisper-large-v3')).toEqual({
      amountUsd: 0.001,
      estimated: true,
    })
  })

  it('emits growing interim text and then the sentence as final', () => {
    const session = localDemo().transcribeStream!({ model: 'large-v3-turbo', language: 'auto' })
    const events: LiveEvent[] = []
    session.onEvent((event) => events.push(event))

    vi.advanceTimersByTime(TIMING.firstWordDelayMs)
    expect(events).toEqual([{ type: 'interim', text: firstLineWords[0] }])

    vi.advanceTimersByTime(TIMING.wordIntervalMs)
    expect(events.at(-1)).toEqual({ type: 'interim', text: firstLineWords.slice(0, 2).join(' ') })

    vi.advanceTimersByTime(TIMING.wordIntervalMs * firstLineWords.length)
    const finals = events.filter((event) => event.type === 'final')
    expect(finals).toHaveLength(1)
    expect(finals[0]).toMatchObject({ segment: { text: firstLine } })
    session.abort()
  })

  it('turns the words spoken so far into a final segment on stop', async () => {
    const session = localDemo().transcribeStream!({ model: 'large-v3-turbo', language: 'auto' })
    const events: LiveEvent[] = []
    session.onEvent((event) => events.push(event))

    vi.advanceTimersByTime(TIMING.firstWordDelayMs + TIMING.wordIntervalMs * 2)
    const stopped = session.stop()
    await vi.advanceTimersByTimeAsync(TIMING.finalizeDelayMs)
    const result = await stopped

    expect(joinSegments(result.segments)).toBe(firstLineWords.slice(0, 3).join(' '))
    expect(events.at(-1)).toMatchObject({ type: 'final' })
    expect(result.cost).toBeNull()

    const eventCount = events.length
    vi.advanceTimersByTime(5_000)
    expect(events).toHaveLength(eventCount)
  })

  it('returns the same result when stop is called twice', async () => {
    const session = localDemo().transcribeStream!({ model: 'large-v3-turbo', language: 'auto' })
    vi.advanceTimersByTime(TIMING.firstWordDelayMs)
    const first = session.stop()
    const second = session.stop()
    await vi.advanceTimersByTimeAsync(TIMING.finalizeDelayMs)
    expect(await second).toBe(await first)
  })

  it('fails with a provider error when asked to simulate one', () => {
    const provider = createDemoProvider({
      id: 'demo-failing',
      kind: 'cloud',
      models: [{ id: 'whisper-large-v3' }],
      usdPerAudioSecond: 0.00001,
      failAfterMs: 300,
      ...TIMING,
    })
    const session = provider.transcribeStream!({ model: 'whisper-large-v3', language: 'auto' })
    const events: LiveEvent[] = []
    session.onEvent((event) => events.push(event))

    vi.advanceTimersByTime(300)
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { kind: 'provider-unavailable', canSwitchToLocal: true },
    })

    const eventCount = events.length
    vi.advanceTimersByTime(5_000)
    expect(events).toHaveLength(eventCount)
  })
})
