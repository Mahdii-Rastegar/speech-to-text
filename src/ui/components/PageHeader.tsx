import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useRecording } from '@/app/stores/recordingStore'
import { openView } from '@/app/stores/uiStore'
import { isBusy } from '@/core/recording/machine'
import { fa } from '@/ui/strings/fa'

/** Top of a secondary screen: the way back, the screen's name, and a reminder if a recording is running. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  const busy = useRecording((state) => isBusy(state.phase))
  const backRef = useRef<HTMLButtonElement>(null)

  // The control that opened this screen is gone, so keyboard focus starts at the way back.
  useEffect(() => {
    backRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <header className="shrink-0 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-2 px-2 sm:px-4 lg:px-6">
        <button
          type="button"
          ref={backRef}
          onClick={() => openView('main')}
          aria-label={fa.nav.back}
          className="icon-btn"
        >
          <ArrowRight aria-hidden="true" className="size-5 ltr:rotate-180" />
        </button>
        <h2 className="text-[1.0625rem] font-semibold text-ink">{title}</h2>
        <div className="ms-auto flex items-center gap-2">
          {busy && (
            <button
              type="button"
              onClick={() => openView('main')}
              aria-label={fa.nav.backToRecording}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-rec/40 bg-rec/10 px-3 text-[0.8125rem] text-rec transition-colors duration-150 hover:bg-rec/15 pointer-coarse:h-11"
            >
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-rec" />
              {fa.recorder.recording}
            </button>
          )}
          {children}
        </div>
      </div>
    </header>
  )
}
