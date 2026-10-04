export type TextDirection = 'rtl' | 'ltr'

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g
const LATIN_SCRIPT = /[A-Za-zÀ-ɏ]/g

/** Below this many letters the text is too short to judge and the fallback wins. */
const MIN_LETTERS = 8

/**
 * Direction of a paragraph by the script most of its letters use.
 *
 * The browser's own `dir="auto"` looks only at the first strong character, so a
 * Persian sentence that opens with an English term ("API رو تست کنم") would be
 * laid out left-to-right. Counting letters keeps such sentences right-to-left.
 */
export function detectDirection(text: string, fallback: TextDirection = 'rtl'): TextDirection {
  const arabic = text.match(ARABIC_SCRIPT)?.length ?? 0
  const latin = text.match(LATIN_SCRIPT)?.length ?? 0
  if (arabic + latin < MIN_LETTERS) return fallback
  if (arabic === latin) return fallback
  return arabic > latin ? 'rtl' : 'ltr'
}
