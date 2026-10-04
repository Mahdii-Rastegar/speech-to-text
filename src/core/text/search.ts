import type { TranscriptionSession } from '../session'

/**
 * Folds spelling variants that should not matter when searching Persian text:
 * Arabic forms of «ی» and «ک», the zero-width non-joiner, kashida, diacritics and letter case.
 */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c|\u200d|\u0640|[\u064b-\u0652]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sessions whose title or any version of the transcript contains the query. Order is kept. */
export function searchSessions(
  sessions: TranscriptionSession[],
  query: string,
): TranscriptionSession[] {
  const needle = normalizeForSearch(query)
  if (needle.length === 0) return sessions
  return sessions.filter((session) =>
    [session.title, session.rawTranscript, session.cleanTranscript, session.summary].some(
      (text) => text !== null && normalizeForSearch(text).includes(needle),
    ),
  )
}
