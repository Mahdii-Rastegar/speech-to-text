import {
  CircleCheck,
  Download,
  EllipsisVertical,
  Share,
  ShieldAlert,
  SquarePlus,
  type LucideIcon,
} from 'lucide-react'
import { APP_NAME } from '@/app/config'
import { promptInstall, useInstall, type InstallPlatform } from '@/app/stores/installStore'
import { updateSettings } from '@/app/stores/settingsStore'
import { toPersianDigits } from '@/core/format/digits'
import { cn } from '@/ui/format'
import { fa } from '@/ui/strings/fa'
import { VoiceMark } from './Wordmark'

/** What each step's button looks like in the browser, in the order of the steps. */
const STEP_ICONS: Record<InstallPlatform, readonly LucideIcon[]> = {
  ios: [Share, SquarePlus, CircleCheck],
  android: [EllipsisVertical, SquarePlus, CircleCheck],
}

const named = (text: string) => text.replace('{name}', APP_NAME)

const TILE = 'aspect-square rounded-[0.5rem] bg-raised'

/** A home screen with the app's icon landing among the others. */
function HomeScreen() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-36">
      <span className="absolute -inset-6 animate-breathe rounded-full bg-[radial-gradient(closest-side,rgb(92_203_242/0.4),transparent)] blur-xl" />
      <div className="relative rounded-[1.5rem] border border-line-strong bg-backdrop p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_24px_50px_-20px_rgb(0_0_0/0.9)]">
        <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} className={TILE} />
          ))}
          <span className="relative aspect-square">
            <span className="absolute inset-0 animate-ripple rounded-[0.5rem] border border-live [animation-delay:640ms]" />
            <span className="absolute inset-0 grid animate-pop-in place-items-center rounded-[0.5rem] border border-live/50 bg-surface shadow-[0_0_16px_rgb(92_203_242/0.45)] [animation-delay:420ms]">
              <VoiceMark className="w-[72%] text-live" />
            </span>
          </span>
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={cn(TILE, index > 1 && 'opacity-50')} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Steps({ platform }: { platform: InstallPlatform }) {
  const icons = STEP_ICONS[platform]
  return (
    <section className="surface-card mt-5 p-4">
      <h2 className="text-xs font-medium text-ink-3">{fa.install.stepsTitle}</h2>
      <ol className="mt-3 grid gap-4">
        {fa.install.steps[platform].map((step, index) => {
          const Icon = icons[index] ?? CircleCheck
          return (
            <li key={step.title} className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-live/12 text-sm font-semibold text-live">
                {toPersianDigits(index + 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink">{step.title}</span>
                <span className="mt-0.5 block text-sm leading-6 text-ink-2">
                  {named(step.body)}
                </span>
              </span>
              <span className="grid size-10 shrink-0 place-items-center rounded-[0.75rem] border border-line-strong bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
                <Icon aria-hidden="true" className="size-[1.125rem] text-live" />
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/**
 * Shown in a phone's browser before anything else: how to put the app on the
 * home screen, and what is lost by not doing it. It can always be skipped, and
 * Settings leads back to it.
 */
export function InstallGuide() {
  const platform = useInstall((state) => state.platform)
  const canPrompt = useInstall((state) => state.canPrompt)
  const installed = useInstall((state) => state.installed)
  const close = () => updateSettings({ installGuideSeen: true })

  if (!platform) return null

  return (
    <main className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="stagger mx-auto flex min-h-full w-full max-w-[30rem] flex-col justify-center px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-5">
          <HomeScreen />

          {installed ? (
            <>
              <h1 className="mt-6 text-center text-2xl leading-[1.7] font-bold text-ink">
                <span className="text-gradient-live">{fa.install.installedTitle}</span>
              </h1>
              <p className="mt-1 text-center text-[0.9375rem] leading-7 text-ink-2">
                {named(fa.install.installedBody)}
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-center text-2xl leading-[1.7] font-bold text-ink">
                {named(fa.install.title)}
              </h1>
              <p className="mt-1 text-center text-[0.9375rem] leading-7 text-ink-2">
                {fa.install.lead}
              </p>

              {canPrompt ? (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => void promptInstall()}
                    className="btn btn-primary h-12 w-full text-[0.9375rem] font-semibold"
                  >
                    <Download aria-hidden="true" className="size-[1.125rem]" />
                    {fa.install.prompt}
                  </button>
                  <p className="mt-2 text-center text-xs text-ink-3">{fa.install.promptHint}</p>
                </div>
              ) : (
                <Steps platform={platform} />
              )}

              <section className="mt-4 rounded-[1rem] border border-rec/30 bg-rec/8 p-4">
                <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                  <ShieldAlert aria-hidden="true" className="size-[1.125rem] shrink-0 text-rec" />
                  {fa.install.whyTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-2">{fa.install.why[platform]}</p>
                {platform === 'ios' && (
                  <p className="mt-2 text-sm leading-6 text-ink-2">{fa.install.separateStorage}</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      {/* Always in reach, so nobody has to scroll past the guide to find the way on. */}
      <div className="shrink-0 border-t border-line bg-backdrop/80 px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[30rem]">
          {installed ? (
            <button
              type="button"
              onClick={close}
              className="btn btn-primary h-12 w-full text-[0.9375rem] font-semibold"
            >
              {fa.install.continue}
            </button>
          ) : (
            <button type="button" onClick={close} className="btn h-12 w-full text-ink-2">
              {fa.install.skip}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
