import { History, Settings } from 'lucide-react'
import { notify, uiStore } from '@/app/stores/uiStore'
import { fa } from '@/ui/strings/fa'
import { StatusChip } from './StatusChip'
import { Wordmark } from './Wordmark'

export function TopBar() {
  return (
    <header className="shrink-0 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-2 px-2 sm:px-4 lg:px-6">
        <button
          type="button"
          onClick={() => uiStore.setState({ railOpen: true })}
          aria-label={fa.history.open}
          className="icon-btn lg:hidden"
        >
          <History aria-hidden="true" className="size-5" />
        </button>
        <Wordmark className="lg:hidden" />

        <div className="ms-auto flex items-center gap-2.5 lg:ms-0">
          <StatusChip />
          <span
            title={fa.demo.note}
            className="hidden rounded-full border border-line-strong px-2.5 py-1 text-xs text-ink-3 sm:inline-block"
          >
            {fa.demo.badge}
          </span>
        </div>

        <button
          type="button"
          onClick={() => notify('coming-soon')}
          aria-label={fa.history.settings}
          className="icon-btn lg:hidden"
        >
          <Settings aria-hidden="true" className="size-5" />
        </button>
      </div>
    </header>
  )
}
