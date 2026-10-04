import { Check, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { updateSettings, useSettings } from '@/app/stores/settingsStore'
import { cn } from '@/ui/format'
import { fa } from '@/ui/strings/fa'
import { ToggleSwitch } from './ToggleSwitch'

interface OptionChipProps {
  pressed: boolean
  onChange: (pressed: boolean) => void
  children: ReactNode
}

function OptionChip({ pressed, onChange, children }: OptionChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] transition-colors duration-150 pointer-coarse:h-11',
        pressed
          ? 'border-ai/50 bg-ai/12 text-ink'
          : 'border-line-strong text-ink-2 hover:bg-hover hover:text-ink',
      )}
    >
      {pressed && <Check aria-hidden="true" className="size-3.5 text-ai" strokeWidth={2.5} />}
      {children}
    </button>
  )
}

/**
 * What happens to the text after a recording stops. Independent of the STT
 * engine. The detailed options appear only once AI processing is switched on.
 */
export function AiOptions({ className }: { className?: string }) {
  const aiEnabled = useSettings((settings) => settings.aiEnabled)
  const cleanEnabled = useSettings((settings) => settings.cleanEnabled)
  const summaryEnabled = useSettings((settings) => settings.summaryEnabled)

  return (
    <fieldset
      className={cn(
        'flex min-w-0 flex-col items-center gap-x-3.5 gap-y-2 md:flex-row md:flex-wrap',
        className,
      )}
    >
      <legend className="sr-only">{fa.ai.group}</legend>
      <label className="inline-flex h-8 items-center gap-2.5 text-sm text-ink pointer-coarse:h-11">
        <ToggleSwitch
          checked={aiEnabled}
          onCheckedChange={(checked) => updateSettings({ aiEnabled: checked })}
        />
        <span className="inline-flex items-center gap-1.5">
          <Sparkles
            aria-hidden="true"
            className={cn('size-4', aiEnabled ? 'text-ai' : 'text-ink-3')}
          />
          {fa.ai.master}
        </span>
      </label>
      {aiEnabled && (
        <div className="flex items-center gap-2">
          <OptionChip
            pressed={cleanEnabled}
            onChange={(pressed) => updateSettings({ cleanEnabled: pressed })}
          >
            {fa.ai.clean}
          </OptionChip>
          <OptionChip
            pressed={summaryEnabled}
            onChange={(pressed) => updateSettings({ summaryEnabled: pressed })}
          >
            {fa.ai.summary}
          </OptionChip>
        </div>
      )}
    </fieldset>
  )
}
