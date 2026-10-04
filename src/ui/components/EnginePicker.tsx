import { Cloud, HardDrive } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { selectProvider } from '@/app/recordingController'
import { FALLBACK_PROVIDER_ID, providers } from '@/app/services'
import { updateSettings, useSettings } from '@/app/stores/settingsStore'
import type { LanguageSetting } from '@/core/session'
import { cn } from '@/ui/format'
import { fa, providerName } from '@/ui/strings/fa'

const LANGUAGES: readonly LanguageSetting[] = ['auto', 'fa', 'en']

interface PickerProps {
  /** Id of the heading that names the group. */
  labelledBy: string
  disabled?: boolean
  className?: string
}

/** The speech-to-text engines, one per row, with where each one runs. */
export function EngineRadios({ labelledBy, disabled, className }: PickerProps) {
  const providerId = useSettings((settings) => settings.sttProviderId)
  const current = providers.get(providerId) ?? providers.get(FALLBACK_PROVIDER_ID)

  return (
    <RadioGroup.Root
      dir="rtl"
      value={current?.id ?? ''}
      onValueChange={selectProvider}
      disabled={disabled}
      aria-labelledby={labelledBy}
      className={cn('grid gap-1', className)}
    >
      {providers.list().map((entry) => {
        const EntryIcon = entry.getCapabilities().offline ? HardDrive : Cloud
        const hint = fa.providers[entry.id]?.hint
        return (
          <RadioGroup.Item
            key={entry.id}
            value={entry.id}
            className="group flex min-h-12 w-full items-center gap-3 rounded-[0.625rem] px-2.5 py-2 text-start transition-colors duration-150 hover:bg-hover disabled:opacity-50 data-[state=checked]:bg-hover"
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
  )
}

/** Language of the speech, as a three-way segmented control. */
export function LanguageRadios({ labelledBy, disabled, className }: PickerProps) {
  const language = useSettings((settings) => settings.language)

  return (
    <RadioGroup.Root
      dir="rtl"
      value={language}
      onValueChange={(value) => {
        const next = LANGUAGES.find((entry) => entry === value)
        if (next) updateSettings({ language: next })
      }}
      disabled={disabled}
      aria-labelledby={labelledBy}
      className={cn('grid grid-cols-3 gap-1 rounded-[0.625rem] bg-surface p-1', className)}
    >
      {LANGUAGES.map((entry) => (
        <RadioGroup.Item
          key={entry}
          value={entry}
          className="h-9 rounded-[0.4375rem] text-[0.8125rem] text-ink-2 transition-colors duration-150 hover:text-ink disabled:opacity-50 data-[state=checked]:bg-hover data-[state=checked]:text-ink pointer-coarse:h-11"
        >
          {fa.languages[entry]}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
