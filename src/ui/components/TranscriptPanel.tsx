import { RotateCcw, Settings, Sparkles, TriangleAlert } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { memo, type ReactNode } from 'react'
import { processSession, retry, switchToLocalAndRetry } from '@/app/recordingController'
import { FALLBACK_PROVIDER_ID, isDemoProvider, providers } from '@/app/services'
import { useRecording } from '@/app/stores/recordingStore'
import { useSessions } from '@/app/stores/sessionsStore'
import { useSettings } from '@/app/stores/settingsStore'
import { openView, uiStore, useUi } from '@/app/stores/uiStore'
import type { AppError, AppErrorKind } from '@/core/errors'
import { isBusy } from '@/core/recording/machine'
import { transcriptOf, type TranscriptVersion, type TranscriptionSession } from '@/core/session'
import { joinSegments } from '@/core/stt/provider'
import { detectDirection, type TextDirection } from '@/core/text/direction'
import { cn, costLabel, dateTimeLabel, durationLabel } from '@/ui/format'
import { useProvider } from '@/ui/hooks/useProvider'
import { useStickToBottom } from '@/ui/hooks/useStickToBottom'
import { fa, providerName } from '@/ui/strings/fa'
import { CopyButton } from './CopyButton'
import { VoiceLine } from './VoiceLine'
import { VoiceMark } from './Wordmark'

const VERSIONS: readonly TranscriptVersion[] = ['raw', 'clean', 'summary']

/** Failures whose fix is a setting, so the message offers the way there. */
const FIXED_IN_SETTINGS: readonly AppErrorKind[] = [
  'missing-api-key',
  'invalid-api-key',
  'model-unavailable',
]

const COLUMN = 'mx-auto w-full max-w-[46rem] px-5 sm:px-8'

function EmptyState() {
  const provider = useProvider()
  const demo = provider !== undefined && isDemoProvider(provider.id)

  return (
    <div className={cn(COLUMN, 'flex min-h-full flex-col justify-center py-10')}>
      <VoiceMark className="h-14 w-28 text-live drop-shadow-[0_0_18px_rgb(92_203_242/0.45)]" />
      <h2 className="mt-7 text-[1.625rem] leading-[1.7] font-bold text-ink sm:text-[2rem]">
        <span className="text-gradient-live">{fa.transcript.heroLead}</span>{' '}
        {fa.transcript.heroRest}
      </h2>
      <p className="transcript mt-3 text-ink-2">
        {fa.transcript.emptyTitle}
        <VoiceLine mode="idle" direction="rtl" />
      </p>
      <p className="mt-1 text-[0.9375rem] leading-7 text-ink-3">{fa.transcript.emptyBody}</p>
      <p className="mt-9 inline-flex w-fit items-center gap-2 rounded-full border border-line bg-backdrop/50 px-3 py-1.5 text-xs leading-5 text-ink-3">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-ai" />
        {demo ? fa.demo.note : fa.demo.localNote}
      </p>
    </div>
  )
}

const FinalSegment = memo(function FinalSegment({ text }: { text: string }) {
  return <span className="animate-ink-settle">{text} </span>
})

/**
 * Text as it is being recognized. Final segments are appended and never
 * re-rendered; only the interim span and the voice line change while speaking.
 */
function LiveTranscript({ settling }: { settling: boolean }) {
  const segments = useRecording((state) => state.segments)
  const interim = useRecording((state) => state.interim)
  const language = useSettings((settings) => settings.language)

  const fallback: TextDirection = language === 'en' ? 'ltr' : 'rtl'
  const direction = detectDirection(`${joinSegments(segments)} ${interim}`, fallback)
  return (
    <p
      dir={direction}
      aria-live="polite"
      aria-relevant="additions"
      aria-atomic="false"
      className="transcript text-ink"
    >
      {segments.map((segment) => (
        <FinalSegment key={segment.id} text={segment.text} />
      ))}
      {interim.length > 0 && (
        <span aria-hidden="true" className="text-ink-2">
          {interim}{' '}
        </span>
      )}
      <VoiceLine mode={settling ? 'settling' : 'live'} direction={direction} />
    </p>
  )
}

function ErrorPanel({ error }: { error: AppError }) {
  const providerId = useSettings((settings) => settings.sttProviderId)
  const provider = providers.get(providerId) ?? providers.get(FALLBACK_PROVIDER_ID)
  const alreadyLocal = provider?.getCapabilities().offline ?? false
  const message = fa.errors[error.kind]

  return (
    <div role="alert" className="rounded-[0.875rem] border border-rec/35 bg-rec/8 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" className="mt-1 size-5 shrink-0 text-rec" />
        <div className="min-w-0">
          <h2 className="text-base leading-7 font-semibold text-ink">{message.title}</h2>
          <p className="mt-0.5 text-[0.9375rem] leading-7 text-ink-2">{message.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {error.retryable && (
              <button type="button" onClick={retry} className="btn btn-primary">
                <RotateCcw aria-hidden="true" className="size-4" />
                {fa.errorActions.retry}
              </button>
            )}
            {error.canSwitchToLocal && !alreadyLocal && (
              <button type="button" onClick={switchToLocalAndRetry} className="btn btn-secondary">
                {fa.errorActions.switchToLocal}
              </button>
            )}
            {FIXED_IN_SETTINGS.includes(error.kind) && (
              <button
                type="button"
                onClick={() => openView('settings')}
                className="btn btn-secondary"
              >
                <Settings aria-hidden="true" className="size-4" />
                {fa.errorActions.openSettings}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FailedView({ error, capturedText }: { error: AppError; capturedText: string }) {
  return (
    <>
      <ErrorPanel error={error} />
      {capturedText.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-medium text-ink-3">{fa.transcript.capturedSoFar}</h2>
          <p dir={detectDirection(capturedText)} className="transcript mt-2 text-ink">
            {capturedText}
          </p>
        </section>
      )}
    </>
  )
}

/**
 * Facts separated by dots that survive wrapping: every item carries its dot in
 * its leading padding, and the list is shifted so the dot of whichever item
 * starts a line falls outside the clipped area.
 */
function MetaRow({ items }: { items: ReactNode[] }) {
  return (
    <div className="mt-1.5 overflow-hidden text-[0.8125rem] text-ink-3">
      <ul className="-ms-5 flex flex-wrap gap-y-1">
        {items.map((item, index) => (
          <li
            key={index}
            className="relative ps-5 before:absolute before:start-2 before:content-['·']"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SessionHeading({ session }: { session: TranscriptionSession }) {
  const recordedAt = dateTimeLabel(session.createdAt)
  const heading = session.title ?? recordedAt
  const items: ReactNode[] = [
    <bdi key="duration">{durationLabel(session.durationMs)}</bdi>,
    <span key="provider">{providerName(session.provider)}</span>,
    <bdi key="model" className="font-mono text-xs">
      {session.model}
    </bdi>,
  ]
  if (session.source === 'file') items.unshift(<span key="source">{fa.session.fromFile}</span>)
  if (session.title) items.unshift(<span key="date">{recordedAt}</span>)
  if (session.cost) items.push(<span key="cost">{costLabel(session.cost)}</span>)

  return (
    <header className="mb-6">
      <h2
        dir={detectDirection(heading)}
        className="text-[1.0625rem] leading-7 font-semibold text-ink"
      >
        {heading}
      </h2>
      <MetaRow items={items} />
    </header>
  )
}

interface AiVersionProps {
  text: string | null
  busy: boolean
  fallbackDirection: TextDirection
  caption: string
  missing: string
  busyLabel: string
  actionLabel: string
  onRequest: () => void
}

/** An AI-made version of the transcript: shown apart from the raw text and labeled as such. */
function AiVersion({
  text,
  busy,
  fallbackDirection,
  caption,
  missing,
  busyLabel,
  actionLabel,
  onRequest,
}: AiVersionProps) {
  if (text) {
    return (
      <>
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs text-ai">
          <Sparkles aria-hidden="true" className="size-3.5" />
          {caption}
        </p>
        <p dir={detectDirection(text, fallbackDirection)} className="transcript text-ink">
          {text}
        </p>
      </>
    )
  }
  if (busy) {
    return (
      <output className="inline-flex items-center gap-2 text-[0.9375rem] text-ink-2">
        <Sparkles aria-hidden="true" className="size-4 animate-pulse text-ai" />
        {busyLabel}
      </output>
    )
  }
  return (
    <div>
      <p className="text-[0.9375rem] leading-7 text-ink-2">{missing}</p>
      <button
        type="button"
        onClick={onRequest}
        className="btn mt-4 border border-ai/45 text-ink hover:bg-ai/10"
      >
        <Sparkles aria-hidden="true" className="size-4 text-ai" />
        {actionLabel}
      </button>
    </div>
  )
}

function SessionView({
  session,
  version,
}: {
  session: TranscriptionSession
  version: TranscriptVersion
}) {
  const processing = useSessions((state) => state.processing[session.id])
  const fallbackDirection: TextDirection = session.language === 'en' ? 'ltr' : 'rtl'

  return (
    <>
      <SessionHeading session={session} />
      {version === 'raw' && (
        <p
          dir={detectDirection(session.rawTranscript, fallbackDirection)}
          className="transcript text-ink"
        >
          {session.rawTranscript}
        </p>
      )}
      {version === 'clean' && (
        <AiVersion
          text={session.cleanTranscript}
          busy={processing?.clean ?? false}
          fallbackDirection={fallbackDirection}
          caption={fa.transcript.cleanCaption}
          missing={fa.transcript.cleanMissing}
          busyLabel={fa.transcript.cleaning}
          actionLabel={fa.transcript.makeClean}
          onRequest={() => void processSession(session.id, { clean: true, summary: false })}
        />
      )}
      {version === 'summary' && (
        <AiVersion
          text={session.summary}
          busy={processing?.summary ?? false}
          fallbackDirection={fallbackDirection}
          caption={fa.transcript.summaryCaption}
          missing={fa.transcript.summaryMissing}
          busyLabel={fa.transcript.summarizing}
          actionLabel={fa.transcript.makeSummary}
          onRequest={() => void processSession(session.id, { clean: false, summary: true })}
        />
      )}
    </>
  )
}

/** The page: the transcript in its three versions, with Copy always within reach. */
export function TranscriptPanel() {
  const phase = useRecording((state) => state.phase)
  const segments = useRecording((state) => state.segments)
  const interim = useRecording((state) => state.interim)
  const error = useRecording((state) => state.error)
  const session = useSessions((state) =>
    state.sessions.find((entry) => entry.id === state.activeSessionId),
  )
  const processing = useSessions((state) => (session ? state.processing[session.id] : undefined))
  const version = useUi((state) => state.version)

  const live = isBusy(phase)
  const failed = phase === 'error' && error !== null
  const showsSession = !live && !failed && session !== undefined
  const capturedText = joinSegments(segments)
  const scrollRef = useStickToBottom<HTMLDivElement>(live ? `${segments.length}:${interim}` : null)

  const copyableText = showsSession ? transcriptOf(session, version) : capturedText
  const hasHeader = live || failed || showsSession

  return (
    <Tabs.Root
      dir="rtl"
      value={showsSession ? version : 'raw'}
      onValueChange={(value) => {
        const next = VERSIONS.find((entry) => entry === value)
        if (next) uiStore.setState({ version: next })
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {hasHeader && (
        <div className="shrink-0">
          <div className={cn(COLUMN, 'flex h-16 items-center justify-between gap-3')}>
            <Tabs.List
              aria-label={fa.versionsLabel}
              className="flex items-center gap-0.5 rounded-full border border-line bg-backdrop/60 p-1"
            >
              {VERSIONS.map((entry) => {
                const madeByAi = entry !== 'raw'
                const busy =
                  entry === 'clean' ? processing?.clean : entry === 'summary' && processing?.summary
                return (
                  <Tabs.Trigger
                    key={entry}
                    value={entry}
                    disabled={madeByAi && !showsSession}
                    title={madeByAi && !showsSession ? fa.transcript.availableAfterStop : undefined}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-ink-3 sm:px-3.5',
                      'transition-colors duration-150 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-3',
                      'data-[state=active]:bg-hover data-[state=active]:text-ink',
                      'data-[state=active]:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(0_0_0/0.4)]',
                    )}
                  >
                    {madeByAi && (
                      <Sparkles
                        aria-hidden="true"
                        className={cn('size-3.5 text-ai', busy && 'animate-pulse')}
                      />
                    )}
                    {fa.versions[entry]}
                  </Tabs.Trigger>
                )
              })}
            </Tabs.List>
            <CopyButton text={copyableText} />
          </div>
        </div>
      )}

      <Tabs.Content
        ref={scrollRef}
        value={showsSession ? version : 'raw'}
        className="min-h-0 flex-1 overflow-y-auto focus-visible:-outline-offset-2"
      >
        {!hasHeader && <EmptyState />}
        {hasHeader && (
          <div className={cn(COLUMN, 'pt-4 pb-10 sm:pt-6')}>
            {live && <LiveTranscript settling={phase === 'finalizing'} />}
            {failed && <FailedView error={error} capturedText={capturedText} />}
            {showsSession && <SessionView session={session} version={version} />}
          </div>
        )}
      </Tabs.Content>
    </Tabs.Root>
  )
}
