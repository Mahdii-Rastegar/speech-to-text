import { Upload } from 'lucide-react'
import { startRecording, stopRecording } from '@/app/recordingController'
import { useRecording } from '@/app/stores/recordingStore'
import { notify } from '@/app/stores/uiStore'
import type { RecordingPhase } from '@/core/recording/machine'
import { cn, durationLabel } from '@/ui/format'
import { useElapsed } from '@/ui/hooks/useElapsed'
import { fa } from '@/ui/strings/fa'
import { AiOptions } from './AiOptions'
import { RecordKey } from './RecordKey'

/** Elapsed time in fixed-width cells, so the digits do not shift as they change. */
function Timer({ ms }: { ms: number }) {
  return (
    <span
      role="timer"
      aria-label={fa.recorder.elapsed}
      dir="ltr"
      className="inline-flex text-[1.75rem] leading-none font-semibold text-ink"
    >
      {[...durationLabel(ms)].map((character, index) => (
        <span
          key={index}
          className={character === ':' ? 'w-[0.34em] text-center text-ink-3' : 'w-[0.58em] text-center'}
        >
          {character}
        </span>
      ))}
    </span>
  )
}

function RecorderStatus({
  phase,
  elapsedMs,
  className,
}: {
  phase: RecordingPhase
  elapsedMs: number
  className?: string
}) {
  if (phase === 'recording' || phase === 'finalizing') {
    return (
      <div className={cn('flex items-center gap-3.5', className)}>
        <Timer ms={elapsedMs} />
        {phase === 'recording' ? (
          <span className="inline-flex items-center gap-2 text-sm text-rec">
            <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-rec" />
            {fa.recorder.recording}
          </span>
        ) : (
          <span className="text-sm text-ink-2">{fa.recorder.finalizing}</span>
        )}
      </div>
    )
  }
  return (
    <p className={cn('text-[0.9375rem] text-ink-2', className)}>
      {phase === 'starting' ? fa.recorder.starting : fa.recorder.start}
    </p>
  )
}

export function RecorderDock() {
  const phase = useRecording((state) => state.phase)
  const startedAt = useRecording((state) => state.startedAt)
  const durationMs = useRecording((state) => state.durationMs)
  const elapsed = useElapsed(startedAt, phase === 'recording')
  const elapsedMs = phase === 'recording' ? elapsed : durationMs

  return (
    <section
      aria-label={fa.recorder.region}
      className="surface-float shrink-0 rounded-t-[1.5rem] border-t border-line-strong px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:mb-5 sm:w-[min(100%-2.5rem,54rem)] sm:rounded-[1.5rem] sm:border sm:px-6 sm:pb-4"
    >
      <div
        className={cn(
          'mx-auto grid max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-x-5 gap-y-3',
          "[grid-template-areas:'status_status_status'_'._key_upload'_'ai_ai_ai']",
          "md:[grid-template-areas:'ai_key_side']",
        )}
      >
        <AiOptions className="[grid-area:ai] md:justify-start" />
        <RecordKey
          phase={phase}
          onStart={startRecording}
          onStop={() => void stopRecording()}
          className="[grid-area:key]"
        />
        <div className="contents md:flex md:items-center md:justify-between md:gap-4 md:[grid-area:side]">
          <RecorderStatus
            phase={phase}
            elapsedMs={elapsedMs}
            className="[grid-area:status] min-h-7 justify-center justify-self-center md:justify-self-auto"
          />
          <button
            type="button"
            onClick={() => notify('coming-soon')}
            aria-label={fa.recorder.upload}
            title={fa.recorder.upload}
            className="icon-btn [grid-area:upload] justify-self-end"
          >
            <Upload aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
    </section>
  )
}
