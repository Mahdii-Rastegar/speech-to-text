import { useEffect, useState } from 'react'
import { useUi, type NoticeKind } from '@/app/stores/uiStore'
import { fa } from '@/ui/strings/fa'

/** Notices that also appear on screen. The rest are only announced to screen readers. */
const VISIBLE: readonly NoticeKind[] = [
  'nothing-recorded',
  'copy-failed',
  'ai-failed',
  'coming-soon',
  'session-deleted',
  'history-cleared',
  'key-not-saved',
]

const VISIBLE_MS = 3200

export function Toaster() {
  const notice = useUi((state) => state.notice)
  const [dismissedId, setDismissedId] = useState(0)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setDismissedId(notice.id), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const message = notice ? fa.notices[notice.kind] : ''
  const shown = notice !== null && VISIBLE.includes(notice.kind) && dismissedId !== notice.id

  return (
    <>
      <output aria-live="polite" className="sr-only">
        {notice && <span key={notice.id}>{message}</span>}
      </output>
      {shown && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
        >
          <div
            key={notice.id}
            className="animate-toast-in rounded-full border border-line-strong bg-raised px-4 py-2 text-sm text-ink shadow-[0_12px_32px_-10px_rgb(0_0_0/0.7)]"
          >
            {message}
          </div>
        </div>
      )}
    </>
  )
}
