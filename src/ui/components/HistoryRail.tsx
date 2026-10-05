import { Search, Settings, Trash2 } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useMemo, useState } from 'react'
import { selectSession } from '@/app/recordingController'
import { useRecording } from '@/app/stores/recordingStore'
import { removeSession, useSessions } from '@/app/stores/sessionsStore'
import { notify, openView, uiStore, useUi } from '@/app/stores/uiStore'
import { formatClock } from '@/core/format/date'
import { isBusy } from '@/core/recording/machine'
import type { TranscriptionSession } from '@/core/session'
import { detectDirection } from '@/core/text/direction'
import { costLabel, costShortLabel, durationLabel, groupSessionsByDay } from '@/ui/format'
import { useNow } from '@/ui/hooks/useNow'
import { fa, providerName } from '@/ui/strings/fa'
import { ConfirmDialog } from './ConfirmDialog'
import { Wordmark } from './Wordmark'

function SessionItem({
  session,
  active,
  disabled,
  onDelete,
}: {
  session: TranscriptionSession
  active: boolean
  disabled: boolean
  onDelete: () => void
}) {
  const heading = session.title ?? session.rawTranscript
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => selectSession(session.id)}
        disabled={disabled}
        aria-current={active ? 'true' : undefined}
        className="relative block w-full rounded-[0.75rem] py-2.5 ps-3 pe-11 text-start transition-colors duration-150 before:absolute before:inset-y-3 before:start-0 before:w-[3px] before:origin-center before:scale-y-50 before:rounded-full before:bg-live before:opacity-0 before:transition-[opacity,scale] before:duration-200 hover:bg-raised disabled:opacity-50 aria-[current=true]:bg-raised aria-[current=true]:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] aria-[current=true]:before:scale-y-100 aria-[current=true]:before:opacity-100"
      >
        <span dir={detectDirection(heading)} className="block truncate text-[0.9375rem] text-ink">
          {heading}
        </span>
        <span className="mt-1 flex items-center gap-x-2 overflow-hidden text-xs whitespace-nowrap text-ink-3">
          <span>{formatClock(new Date(session.createdAt))}</span>
          <span aria-hidden="true">·</span>
          <bdi>{durationLabel(session.durationMs)}</bdi>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{providerName(session.provider)}</span>
          {session.cost && (
            <>
              <span aria-hidden="true">·</span>
              <span title={costLabel(session.cost)}>{costShortLabel(session.cost)}</span>
            </>
          )}
        </span>
      </button>
      {/* A finger has no hover to reveal it with, so on touch screens it is always there. */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={fa.history.deleteSession}
        title={fa.history.deleteSession}
        className="icon-btn absolute end-0.5 top-1/2 size-10 -translate-y-1/2 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-rec focus-visible:opacity-100 pointer-coarse:opacity-100"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}

/** Past sessions grouped by day. Opening one shows its transcript in the main view. */
export function HistoryRail() {
  const sessions = useSessions((state) => state.sessions)
  const loaded = useSessions((state) => state.loaded)
  const activeSessionId = useSessions((state) => state.activeSessionId)
  const busy = useRecording((state) => isBusy(state.phase))
  const view = useUi((state) => state.view)
  const now = useNow()
  const groups = useMemo(() => groupSessionsByDay(sessions, now), [sessions, now])
  const [pendingId, setPendingId] = useState<string | null>(null)

  return (
    <nav aria-label={fa.history.title} className="flex h-full w-full min-w-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between ps-5 pe-2.5">
        <Wordmark />
        <button
          type="button"
          onClick={() => openView('history')}
          aria-label={fa.history.openSearch}
          title={fa.history.openSearch}
          aria-current={view === 'history' ? 'page' : undefined}
          className="icon-btn aria-[current=page]:bg-raised aria-[current=page]:text-ink"
        >
          <Search aria-hidden="true" className="size-[1.125rem]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
        {groups.length === 0
          ? loaded && <p className="px-2.5 py-3 text-sm text-ink-3">{fa.history.empty}</p>
          : groups.map((group) => (
              <section key={group.label}>
                <h2 className="px-2.5 pt-4 pb-1.5 text-xs font-medium text-ink-3">{group.label}</h2>
                <ul>
                  {group.sessions.map((session) => (
                    <li key={session.id}>
                      <SessionItem
                        session={session}
                        active={view === 'main' && session.id === activeSessionId}
                        disabled={busy}
                        onDelete={() => setPendingId(session.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
      </div>

      <div className="shrink-0 border-t border-line p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => openView('settings')}
          aria-current={view === 'settings' ? 'page' : undefined}
          className="flex h-11 w-full items-center gap-2.5 rounded-[0.625rem] px-2.5 text-sm text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink aria-[current=page]:bg-raised aria-[current=page]:text-ink"
        >
          <Settings aria-hidden="true" className="size-[1.125rem]" />
          {fa.history.settings}
        </button>
      </div>

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingId(null)
        }}
        title={fa.history.confirmDeleteTitle}
        body={fa.history.confirmDeleteBody}
        confirmLabel={fa.history.confirmDelete}
        onConfirm={() => {
          if (pendingId === null) return
          removeSession(pendingId)
          notify('session-deleted')
        }}
      />
    </nav>
  )
}

/** The same rail as a side sheet, for screens too narrow to keep it open. */
export function HistorySheet() {
  const open = useUi((state) => state.railOpen)
  return (
    <Dialog.Root open={open} onOpenChange={(railOpen) => uiStore.setState({ railOpen })}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-backdrop/75" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 start-0 z-50 w-[min(20rem,86vw)] animate-sheet-in border-e border-line bg-backdrop pt-[env(safe-area-inset-top)] overscroll-contain ltr:[--sheet-from:-100%]"
        >
          <Dialog.Title className="sr-only">{fa.history.title}</Dialog.Title>
          <HistoryRail />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
