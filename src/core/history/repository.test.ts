import { describe, expect, it } from 'vitest'
import type { TranscriptionSession } from '../session'
import { createMemoryHistory, parseStoredSession } from './repository'

const session = (id: string, createdAt: string): TranscriptionSession => ({
  id,
  createdAt,
  updatedAt: createdAt,
  durationMs: 12_000,
  language: 'fa',
  source: 'file',
  provider: 'local-whisper',
  model: 'large-v3-turbo',
  title: null,
  rawTranscript: 'متن جلسه',
  cleanTranscript: null,
  summary: null,
  cost: null,
  status: 'done',
})

describe('parseStoredSession', () => {
  it('reads back what was stored', () => {
    const stored = { ...session('a', '2026-10-05T08:00:00.000Z'), title: 'عنوان', summary: 'خلاصه' }
    expect(parseStoredSession(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
  })

  it('drops entries that cannot be shown', () => {
    const good = session('a', '2026-10-05T08:00:00.000Z')
    expect(parseStoredSession(null)).toBeNull()
    expect(parseStoredSession('text')).toBeNull()
    expect(parseStoredSession({ ...good, id: '' })).toBeNull()
    expect(parseStoredSession({ ...good, createdAt: 'yesterday' })).toBeNull()
    expect(parseStoredSession({ ...good, rawTranscript: 42 })).toBeNull()
  })

  it('fills in what an older or hand-edited entry lacks', () => {
    const parsed = parseStoredSession({
      id: 'a',
      createdAt: '2026-10-05T08:00:00.000Z',
      rawTranscript: 'متن',
      language: 'de',
      durationMs: -5,
      cost: { amountUsd: 'free' },
      status: 'processing',
    })
    expect(parsed).toEqual({
      ...session('a', '2026-10-05T08:00:00.000Z'),
      rawTranscript: 'متن',
      durationMs: 0,
      language: 'auto',
      source: 'microphone',
      provider: '',
      model: '',
    })
  })

  it('keeps a cost and treats it as an estimate unless told otherwise', () => {
    const good = session('a', '2026-10-05T08:00:00.000Z')
    expect(parseStoredSession({ ...good, cost: { amountUsd: 0.002 } })?.cost).toEqual({
      amountUsd: 0.002,
      estimated: true,
    })
    expect(
      parseStoredSession({ ...good, cost: { amountUsd: 0.002, estimated: false } })?.cost,
    ).toEqual({ amountUsd: 0.002, estimated: false })
  })
})

describe('createMemoryHistory', () => {
  it('lists newest first, replaces by id, removes and clears', async () => {
    const history = createMemoryHistory([session('old', '2026-10-01T08:00:00.000Z')])
    await history.save(session('new', '2026-10-05T08:00:00.000Z'))
    await history.save({ ...session('old', '2026-10-01T08:00:00.000Z'), title: 'با عنوان' })

    const listed = await history.list()
    expect(listed.map((entry) => entry.id)).toEqual(['new', 'old'])
    expect(listed[1]?.title).toBe('با عنوان')

    await history.remove('new')
    expect(await history.list()).toHaveLength(1)
    await history.clear()
    expect(await history.list()).toEqual([])
  })
})
