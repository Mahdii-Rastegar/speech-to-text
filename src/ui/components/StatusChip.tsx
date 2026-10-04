import { ChevronDown, Cloud, HardDrive } from 'lucide-react'
import { Popover, RadioGroup } from 'radix-ui'
import { useId } from 'react'
import { selectProvider } from '@/app/recordingController'
import { FALLBACK_PROVIDER_ID, providers } from '@/app/services'
import { useRecording } from '@/app/stores/recordingStore'
import { updateSettings, useSettings } from '@/app/stores/settingsStore'
import { isBusy } from '@/core/recording/machine'
import type { LanguageSetting } from '@/core/session'
import { fa, providerName } from '@/ui/strings/fa'

const LANGUAGES: readonly LanguageSetting[] = ['auto', 'fa', 'en']

/**
 * Says where speech is being turned into text (on this device or in the cloud)
 * and opens the quick switch for engine and language.
 */
export function StatusChip() {
  const providerId = useSettings((settings) => settings.sttProviderId)
  const language = useSettings((settings) => settings.language)
  const busy = useRecording((state) => isBusy(state.phase))
  const engineHeadingId = useId()
  const languageHeadingId = useId()

  const provider = providers.get(providerId) ?? providers.get(FALLBACK_PROVIDER_ID)
  if (!provider) return null

  const offline = provider.getCapabilities().offline
  const statusText = offline ? fa.status.local : fa.status.cloud
  const StatusIcon = offline ? HardDrive : Cloud

  return (
    <Popover.Root>
      <Popover.Trigger
        disabled={busy}
        aria-label={`${statusText}، ${fa.status.change}`}
        title={busy ? fa.status.lockedWhileRecording : undefined}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-raised/80 ps-3 pe-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] text-[0.8125rem] text-ink transition-colors duration-150 hover:bg-hover disabled:opacity-60 pointer-coarse:h-11"
      >
        <StatusIcon aria-hidden="true" className="size-4 text-ink-2" />
        <span>{statusText}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 text-ink-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(20rem,calc(100vw-1.5rem))] animate-fade-in surface-float rounded-[1rem] border border-line-strong p-4"
        >
          <h2 id={engineHeadingId} className="px-2.5 text-xs font-medium text-ink-3">
            {fa.status.engineTitle}
          </h2>
          <RadioGroup.Root
            dir="rtl"
            value={provider.id}
            onValueChange={selectProvider}
            aria-labelledby={engineHeadingId}
            className="mt-2 grid gap-1"
          >
            {providers.list().map((entry) => {
              const EntryIcon = entry.getCapabilities().offline ? HardDrive : Cloud
              const hint = fa.providers[entry.id]?.hint
              return (
                <RadioGroup.Item
                  key={entry.id}
                  value={entry.id}
                  className="group flex min-h-12 w-full items-center gap-3 rounded-[0.625rem] px-2.5 py-2 text-start transition-colors duration-150 hover:bg-hover data-[state=checked]:bg-hover"
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded-full border border-line-strong group-data-[state=checked]:border-live">
                    <RadioGroup.Indicator className="size-2 rounded-full bg-live" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{providerName(entry.id)}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {hint ?? <bdi className="font-mono">{entry.models[0]?.id}</bdi>}
                    </span>
                  </span>
                  <EntryIcon aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
                </RadioGroup.Item>
              )
            })}
          </RadioGroup.Root>
          <p className="mt-2 px-2.5 text-xs leading-5 text-ink-3">
            {offline ? fa.status.localPrivacy : fa.status.cloudPrivacy}
          </p>

          <div className="my-3.5 h-px bg-line" />

          <h2 id={languageHeadingId} className="px-2.5 text-xs font-medium text-ink-3">
            {fa.status.languageTitle}
          </h2>
          <RadioGroup.Root
            dir="rtl"
            value={language}
            onValueChange={(value) => {
              const next = LANGUAGES.find((entry) => entry === value)
              if (next) updateSettings({ language: next })
            }}
            aria-labelledby={languageHeadingId}
            className="mt-2 grid grid-cols-3 gap-1 rounded-[0.625rem] bg-surface p-1"
          >
            {LANGUAGES.map((entry) => (
              <RadioGroup.Item
                key={entry}
                value={entry}
                className="h-9 rounded-[0.4375rem] text-[0.8125rem] text-ink-2 transition-colors duration-150 hover:text-ink data-[state=checked]:bg-hover data-[state=checked]:text-ink pointer-coarse:h-11"
              >
                {fa.languages[entry]}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
