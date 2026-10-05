import { toAppError, type AppError } from '../../errors'
import { addCosts, type CostInfo } from '../../session'
import type { ChatClient } from '../chat'
import type { AIProcessor } from '../processor'
import { asTranscript, cleanPrompt, summaryPrompt, titlePrompt } from '../prompts'

/** Models sometimes wrap the answer in a code fence or echo the tags; the text inside is what counts. */
function unwrap(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\n?|\n?```$/g, '')
    .replace(/^<transcript>\s*|\s*<\/transcript>$/g, '')
    .trim()
}

/** A title is one short line, without the quotes or the full stop some models add. */
function asTitle(text: string): string {
  const line = unwrap(text).split('\n')[0] ?? ''
  return line
    .trim()
    .replace(/^["'«“]+/, '')
    .replace(/[."'»”]+$/, '')
    .trim()
}

/**
 * The AI step on a chat model. Each requested part is its own request, sent
 * side by side: a part that fails does not take the others with it.
 */
export function createChatAIProcessor(
  client: ChatClient,
  config: { model: string; glossary: string },
): AIProcessor {
  const { model, glossary } = config
  return {
    id: 'chat-ai',
    async process(rawTranscript, options) {
      const user = asTranscript(rawTranscript)
      const costs: (CostInfo | null)[] = []
      const errors: AppError[] = []

      const ask = async (wanted: boolean, system: string, shape: (text: string) => string) => {
        if (!wanted) return null
        try {
          const reply = await client.complete({ model, system, user })
          costs.push(reply.cost)
          return shape(reply.text) || null
        } catch (cause) {
          errors.push(toAppError(cause))
          return null
        }
      }

      const [cleanTranscript, summary, title] = await Promise.all([
        ask(options.clean, cleanPrompt(glossary), unwrap),
        ask(options.summary, summaryPrompt(glossary), unwrap),
        ask(options.title, titlePrompt(), asTitle),
      ])
      return {
        cleanTranscript,
        summary,
        title,
        cost: costs.reduce<CostInfo | null>(addCosts, null),
        error: errors[0] ?? null,
      }
    },
  }
}
