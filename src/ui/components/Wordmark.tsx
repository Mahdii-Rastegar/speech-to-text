import { APP_NAME } from '@/app/config'
import { cn } from '@/ui/format'

/**
 * The voice line: flat where it meets the text, growing into a wave away from
 * it. The same motif runs live at the end of the transcript while recording.
 */
export function VoiceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M35 10H28C26.5 10 26.5 5 25 5S23.5 15.5 22 15.5 20 2.5 18.5 2.5 16.5 17 15 17 13.5 6 12 6 10.5 13 9 13 7.5 8.5 6 8.5 4.5 10 1 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
