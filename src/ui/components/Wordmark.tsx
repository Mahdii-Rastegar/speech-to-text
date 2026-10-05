import { APP_NAME } from '@/app/config'
import { cn } from '@/ui/format'

const VOICE_PATH =
  'M35 10H28C26.5 10 26.5 5 25 5S23.5 15.5 22 15.5 20 2.5 18.5 2.5 16.5 17 15 17 13.5 6 12 6 10.5 13 9 13 7.5 8.5 6 8.5 4.5 10 1 10'

/**
 * The voice line: flat where it meets the text, growing into a wave away from
 * it. The same motif runs live at the end of the transcript while recording.
 */
export function VoiceMark({ className, drawn }: { className?: string; drawn?: boolean }) {
  return (
    <svg viewBox="0 0 36 20" fill="none" aria-hidden="true" className={className}>
      <path
        d={VOICE_PATH}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        // Drawn from the text outwards, once, where the mark is the first thing seen.
        pathLength={drawn ? 1 : undefined}
        strokeDasharray={drawn ? 1 : undefined}
        className={drawn ? 'animate-draw' : undefined}
      />
    </svg>
  )
}

/**
 * The mark as the first thing a newcomer sees: the line is drawn, and then a
 * light keeps running along it over a slow glow, as if a voice were passing.
 */
export function VoiceMarkHero({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('relative', className)}>
      <span className="absolute -inset-x-6 -inset-y-8 animate-breathe rounded-full bg-[radial-gradient(closest-side,rgb(92_203_242/0.5),transparent)] blur-xl" />
      <svg viewBox="0 0 36 20" fill="none" className="relative size-full overflow-visible">
        <path
          d={VOICE_PATH}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          className="animate-draw text-live"
        />
        <path
          d={VOICE_PATH}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="0.16 2"
          className="animate-spark stroke-ink drop-shadow-[0_0_3px_rgb(233_238_248/0.9)] motion-reduce:hidden"
        />
      </svg>
    </div>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <h1 className={cn('inline-flex items-center gap-2', className)}>
      <span className="text-[1.3125rem] leading-none font-extrabold text-ink">{APP_NAME}</span>
      <VoiceMark className="h-5 w-9 text-live" />
    </h1>
  )
}
