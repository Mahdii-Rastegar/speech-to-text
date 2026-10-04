import { ChevronDown, Cloud, HardDrive } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useId } from 'react'
import { FALLBACK_PROVIDER_ID, providers } from '@/app/services'
import { useRecording } from '@/app/stores/recordingStore'
import { useSettings } from '@/app/stores/settingsStore'
import { isBusy } from '@/core/recording/machine'
import { fa } from '@/ui/strings/fa'
import { EngineRadios, LanguageRadios } from './EnginePicker'

/**
 * Says where speech is being turned into text (on this device or in the cloud)
 * and opens the quick switch for engine and language.
 */
export function StatusChip() {
  const providerId = useSettings((settings) => settings.sttProviderId)
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
          <EngineRadios labelledBy={engineHeadingId} className="mt-2" />
          <p className="mt-2 px-2.5 text-xs leading-5 text-ink-3">
            {offline ? fa.status.localPrivacy : fa.status.cloudPrivacy}
          </p>

          <div className="my-3.5 h-px bg-line" />

          <h2 id={languageHeadingId} className="px-2.5 text-xs font-medium text-ink-3">
            {fa.status.languageTitle}
          </h2>
          <LanguageRadios labelledBy={languageHeadingId} className="mt-2" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
