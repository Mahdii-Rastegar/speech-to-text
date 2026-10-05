/** Engines misread very short clips, so short ones are padded with silence up to this. */
const MIN_CLIP_MS = 1100
/** How much of the text so far is handed to the engine as context for the next piece. */
const CONTEXT_CHARS = 200

/** The clip as it is sent: at least long enough for an engine to read it properly. */
export function padClip(samples: Float32Array, sampleRate: number): Float32Array {
  const minimum = Math.round((sampleRate * MIN_CLIP_MS) / 1000)
  if (samples.length >= minimum) return samples
  const clip = new Float32Array(minimum)
  clip.set(samples)
  return clip
}

/** The glossary, then the end of what was said so far, so spelling and style carry over. */
export function contextPrompt(glossary: string | undefined, said: string): string {
  const tail = said.length > CONTEXT_CHARS ? said.slice(-CONTEXT_CHARS).replace(/^\S*\s/, '') : said
  return `${glossary ?? ''} ${tail}`.trim()
}
