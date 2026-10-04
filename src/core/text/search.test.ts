import { describe, expect, it } from 'vitest'
import type { TranscriptionSession } from '../session'
import { normalizeForSearch, searchSessions } from './search'

const session = (id: string, patch: Partial<TranscriptionSession>): TranscriptionSession => ({
  id,
  createdAt: '2026-10-04T10:00:00.000Z',
  updatedAt: '2026-10-04T10:00:00.000Z',
  durationMs: 1000,
  language: 'fa',
  source: 'microphone',
  provider: 'demo-local',
  model: 'large-v3-turbo',
  title: null,
  rawTranscript: '',
  cleanTranscript: null,
  summary: null,
  cost: null,
  status: 'done',
  ...patch,
})

describe('normalizeForSearch', () => {
  it('ignores the zero-width non-joiner, Arabic letter forms and case', () => {
    expect(normalizeForSearch('می‌شود')).toBe(normalizeForSearch('میشود'))
    expect(normalizeForSearch('كتاب علي')).toBe('کتاب علی')
    expect(normalizeForSearch('  Notion   API ')).toBe('notion api')
  })
})

describe('searchSessions', () => {
  const sessions = [
    session('a', { title: 'کارهای این هفته', rawTranscript: 'تست ضبط صدا' }),
    session('b', { rawTranscript: 'ایده برای Notion', summary: 'ارسال transcript' }),
    session('c', { rawTranscript: 'Release checklist', cleanTranscript: 'Bump the version.' }),
  ]

  it('returns everything for an empty query', () => {
    expect(searchSessions(sessions, '   ')).toBe(sessions)
  })

  it('looks in the title and in every version of the transcript', () => {
    expect(searchSessions(sessions, 'هفته').map((entry) => entry.id)).toEqual(['a'])
    expect(searchSessions(sessions, 'notion').map((entry) => entry.id)).toEqual(['b'])
    expect(searchSessions(sessions, 'TRANSCRIPT').map((entry) => entry.id)).toEqual(['b'])
    expect(searchSessions(sessions, 'bump').map((entry) => entry.id)).toEqual(['c'])
  })

  it('returns nothing when there is no match', () => {
    expect(searchSessions(sessions, 'پیدا نمی‌شود')).toEqual([])
  })
})
