import { Copy, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { copyText } from '@/app/clipboard'
import { selectSession } from '@/app/recordingController'
import { useRecording } from '@/app/stores/recordingStore'
import { clearSessions, removeSession, useSessions } from '@/app/stores/sessionsStore'
import { notify } from '@/app/stores/uiStore'
import { formatClock } from '@/core/format/date'
import { toPersianDigits } from '@/core/format/digits'
import { isBusy } from '@/core/recording/machine'
import type { TranscriptionSession } from '@/core/session'
import { detectDirection } from '@/core/text/direction'
import { searchSessions } from '@/core/text/search'
import { cn, costLabel, costShortLabel, durationLabel, groupSessionsByDay } from '@/ui/format'
import { useNow } from '@/ui/hooks/useNow'
import { fa, providerName } from '@/ui/strings/fa'
import { ConfirmDialog } from './ConfirmDialog'
import { PageHeader } from './PageHeader'

const COLUMN = 'mx-auto w-full max-w-[46rem] px-4 sm:px-8'

type PendingRemoval = { kind: 'one'; id: string } | { kind: 'all' }

function SessionRow({
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

  const copy = async () => {
    const succeeded = await copyText(session.rawTranscript)
    notify(succeeded ? 'copied' : 'copy-failed')
  }

  return (
    <li className="relative rounded-[0.875rem] transition-colors duration-150 hover:bg-raised/70 has-[[aria-current=true]]:bg-raised/70">
      <button
        type="button"
        onClick={() => selectSession(session.id)}
        disabled={disabled}
        aria-current={active ? 'true' : undefined}
        className="block w-full rounded-[0.875rem] py-3 ps-3.5 pe-[6.25rem] text-start disabled:opacity-50"
      >
        <span
          dir={detectDirection(heading)}
          className={cn(
            'text-[0.9375rem] text-ink',
            session.title ? 'block truncate font-medium' : 'line-clamp-2 leading-7',
          )}
        >
          {heading}
        </span>
        {session.title && (
          <span
            dir={detectDirection(session.rawTranscript)}
            className="mt-1 line-clamp-2 text-sm leading-6 text-ink-2"
          >
            {session.rawTranscript}
          </span>
        )}
        <span className="mt-1.5 flex items-center gap-x-2 overflow-hidden text-xs whitespace-nowrap text-ink-3">
          <span>{formatClock(new Date(session.createdAt))}</span>
          <span aria-hidden="true">·</span>
          <bdi>{durationLabel(session.durationMs)}</bdi>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{providerName(session.provider)}</span>
          {session.cost && (
            <>
              <span aria-hidden="true" className="max-sm:hidden">
                ·
              </span>
              <span title={costLabel(session.cost)} className="max-sm:hidden">
                {costShortLabel(session.cost)}
              </span>
            </>
          )}
        </span>
      </button>
      <div className="absolute end-1.5 top-1.5 flex">
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={fa.history.copySession}
          title={fa.history.copySession}
          className="icon-btn"
        >
          <Copy aria-hidden="true" className="size-[1.125rem]" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={fa.history.deleteSession}
          title={fa.history.deleteSession}
          className="icon-btn hover:text-rec"
        >
          <Trash2 aria-hidden="true" className="size-[1.125rem]" />
        </button>
      </div>
    </li>
  )
}

/** Every stored session, searchable, with copy and delete on each row. */
export function HistoryView() {
  const sessions = useSessions((state) => state.sessions)
  const activeSessionId = useSessions((state) => state.activeSessionId)
  const busy = useRecording((state) => isBusy(state.phase))
  const now = useNow()
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<PendingRemoval | null>(null)

  const matches = useMemo(() => searchSessions(sessions, query), [sessions, query])
  const groups = useMemo(() => groupSessionsByDay(matches, now), [matches, now])
  const searching = query.trim().length > 0

  const confirmRemoval = () => {
    if (pending?.kind === 'one') {
      removeSession(pending.id)
      notify('session-deleted')
    } else if (pending?.kind === 'all') {
      clearSessions()
      notify('history-cleared')
    }
  }

  return (
    <>
      <PageHeader title={fa.history.title} />

      <div className={`${COLUMN} shrink-0 pt-2 pb-3`}>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-3"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={fa.history.searchPlaceholder}
            aria-label={fa.history.openSearch}
            enterKeyHint="search"
            className="h-12 w-full rounded-[0.875rem] border border-line-strong bg-backdrop/60 ps-11 pe-12 text-[0.9375rem] text-ink placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={fa.history.clearSearch}
              className="icon-btn absolute end-0.5 top-0.5"
            >
              <X aria-hidden="true" className="size-[1.125rem]" />
            </button>
          )}
        </div>
        <div className="mt-2 flex min-h-11 items-center justify-between gap-3 ps-1">
          <output className="text-[0.8125rem] text-ink-3">
            {toPersianDigits(matches.length)}{' '}
            {searching ? fa.history.resultsUnit : fa.history.sessionsUnit}
          </output>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={() => setPending({ kind: 'all' })}
              className="btn h-9 px-3 text-[0.8125rem] text-ink-2 hover:bg-rec/10 hover:text-rec"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {fa.history.deleteAll}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`${COLUMN} pb-10`}>
          {groups.length === 0 ? (
            <p className="px-1 py-6 text-[0.9375rem] text-ink-2">
              {searching ? fa.history.noResults : fa.history.empty}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.label}>
                <h3 className="px-3.5 pt-4 pb-1.5 text-xs font-medium text-ink-3">{group.label}</h3>
                <ul className="space-y-0.5">
                  {group.sessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      active={session.id === activeSessionId}
                      disabled={busy}
                      onDelete={() => setPending({ kind: 'one', id: session.id })}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={
          pending?.kind === 'all' ? fa.history.confirmClearTitle : fa.history.confirmDeleteTitle
        }
        body={pending?.kind === 'all' ? fa.history.confirmClearBody : fa.history.confirmDeleteBody}
        confirmLabel={pending?.kind === 'all' ? fa.history.confirmClear : fa.history.confirmDelete}
        onConfirm={confirmRemoval}
      />
    </>
  )
}
