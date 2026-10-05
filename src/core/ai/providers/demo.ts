import { DEMO_SCRIPT, DEMO_TITLE } from '../../stt/providers/demoScript'
import { delay } from '../../util/delay'
import type { AIProcessor } from '../processor'

const SENTENCE_END = /[.!?؟…]$/

/** Stand-in for the real AI step: maps the demo script to its cleaned form. */
export function createDemoAIProcessor(options: { delayMs?: number } = {}): AIProcessor {
  const { delayMs = 1400 } = options
  return {
    id: 'demo-ai',
    async process(rawTranscript, { clean, summary, title }, signal) {
      await delay(delayMs, signal)

      const spokenLines = DEMO_SCRIPT.filter((line) => rawTranscript.includes(line.raw))
      let cleaned = rawTranscript
      for (const line of DEMO_SCRIPT) cleaned = cleaned.split(line.raw).join(line.clean)
      cleaned = cleaned.trim()
      if (cleaned.length > 0 && !SENTENCE_END.test(cleaned)) cleaned += '.'

      const hasContent = spokenLines.length > 0
      return {
        cleanTranscript: clean && cleaned.length > 0 ? cleaned : null,
        summary:
          summary && hasContent ? `${spokenLines.map((line) => line.gist).join('؛ ')}.` : null,
        title: title && hasContent ? DEMO_TITLE : null,
        cost: { amountUsd: 0.0006, estimated: true },
        error: null,
      }
    },
  }
}
