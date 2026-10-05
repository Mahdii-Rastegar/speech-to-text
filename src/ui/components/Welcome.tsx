import { AudioLines, HardDrive, KeyRound, Sparkles, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { APP_NAME } from '@/app/config'
import { HAS_LOCAL_ENGINE, isDemoProvider } from '@/app/services'
import { updateSettings } from '@/app/stores/settingsStore'
import { useProvider } from '@/ui/hooks/useProvider'
import { fa } from '@/ui/strings/fa'
import { LanguageRadios } from './EnginePicker'
import { VoiceMarkHero } from './Wordmark'

const POINT_ICONS: readonly LucideIcon[] = HAS_LOCAL_ENGINE
  ? [AudioLines, HardDrive, Sparkles]
  : [AudioLines, KeyRound, Sparkles]

/** First run: what the app does, one choice worth making up front, and the way in. */
export function Welcome() {
  const languageHeadingId = useId()
  const provider = useProvider()
  const demo = provider !== undefined && isDemoProvider(provider.id)

  return (
    <main className="h-full overflow-y-auto">
      <div className="stagger mx-auto flex min-h-full w-full max-w-[34rem] flex-col justify-center px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8">
        <VoiceMarkHero className="h-14 w-28" />
        <p className="mt-7 text-sm text-ink-3">{fa.welcome.lead.replace('{name}', APP_NAME)}</p>
        <h1 className="mt-1 text-[1.625rem] leading-[1.7] font-bold text-ink sm:text-[2rem]">
          <span className="text-gradient-live">{fa.transcript.heroLead}</span>{' '}
          {fa.transcript.heroRest}
        </h1>

        <ul className="mt-7 grid gap-5">
          {(HAS_LOCAL_ENGINE ? fa.welcome.points : fa.welcome.pointsWeb).map((point, index) => {
            const Icon = POINT_ICONS[index] ?? AudioLines
            return (
              <li key={point.title} className="flex items-start gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-[0.75rem] border border-line-strong bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
                  <Icon aria-hidden="true" className="size-[1.125rem] text-live" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-semibold text-ink">
                    {point.title}
                  </span>
                  <span className="mt-0.5 block text-sm leading-6 text-ink-2">{point.body}</span>
                </span>
              </li>
            )
          })}
        </ul>

        <div className="surface-card mt-8 p-4">
          <h2 id={languageHeadingId} className="text-sm text-ink">
            {fa.welcome.languageQuestion}
          </h2>
          <LanguageRadios labelledBy={languageHeadingId} className="mt-3" />
          <p className="mt-2 text-xs text-ink-3">{fa.welcome.languageHint}</p>
        </div>

        <button
          type="button"
          onClick={() => updateSettings({ onboarded: true })}
          className="btn btn-primary mt-6 h-12 w-full text-[0.9375rem] font-semibold"
        >
          {fa.welcome.start}
        </button>
        <p className="mt-4 text-center text-xs leading-5 text-ink-3">
          {demo ? fa.demo.note : fa.demo.localNote}
        </p>
      </div>
    </main>
  )
}
