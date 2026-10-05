import { Mic } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { levelSource } from '@/app/services'
import type { RecordingPhase } from '@/core/recording/machine'
import { cn } from '@/ui/format'
import { fa } from '@/ui/strings/fa'

interface RecordKeyProps {
  phase: RecordingPhase
  onStart: () => void
  onStop: () => void
  className?: string
}

/** The one primary control: starts a recording, and stops it while one is running. */
export function RecordKey({ phase, onStart, onStop, className }: RecordKeyProps) {
  const ringRef = useRef<HTMLSpanElement>(null)
  const recording = phase === 'recording'
  const pending = phase === 'starting' || phase === 'finalizing'

  // The ring follows the input level directly on the element, without re-rendering.
  useEffect(() => {
    const ring = ringRef.current
    if (!recording || !ring) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let level = 0
    const tick = () => {
      level += (levelSource.read() - level) * 0.18
      ring.style.transform = `scale(${1.06 + level * 0.2})`
      ring.style.opacity = String(0.3 + level * 0.45)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      ring.style.transform = ''
      ring.style.opacity = ''
    }
  }, [recording])

  return (
    <button
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={pending}
      aria-label={recording ? fa.recorder.stop : fa.recorder.start}
      className={cn(
        'key-face relative grid size-[4.75rem] shrink-0 place-items-center rounded-full text-on-key',
        'transition-transform duration-150 ease-out hover:scale-[1.03] active:scale-[0.97]',
        'focus-visible:outline-offset-4 disabled:scale-100 disabled:opacity-55',
        className,
      )}
    >
      {phase === 'idle' || phase === 'done' || phase === 'error' ? (
        // Waiting: a slow halo that says the key is alive.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1.5 animate-breathe rounded-full border border-live/60"
        />
      ) : (
        recording && (
          // One ring leaves the key at the moment the recording starts.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-ripple rounded-full border-2 border-live"
          />
        )
      )}
      <span
        ref={ringRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 rounded-full border-2 border-live',
          recording ? 'scale-[1.08] opacity-40' : 'opacity-0',
        )}
      />
      {recording || phase === 'finalizing' ? (
        <span aria-hidden="true" className="size-6 animate-pop-in rounded-[0.4375rem] bg-rec" />
      ) : (
        <Mic aria-hidden="true" className="size-7 animate-pop-in" strokeWidth={2} />
      )}
    </button>
  )
}
