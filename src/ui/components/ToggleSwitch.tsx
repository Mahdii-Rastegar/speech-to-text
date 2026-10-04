import { Switch } from 'radix-ui'
import { cn } from '@/ui/format'

interface ToggleSwitchProps {
  id?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

/** On/off switch. A `<label>` around it, or one pointing at its id, gives it its name. */
export function ToggleSwitch({ id, checked, onCheckedChange, disabled }: ToggleSwitchProps) {
  return (
    <Switch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors duration-150 data-[state=checked]:bg-ai"
    >
      <Switch.Thumb
        className={cn(
          'absolute start-[3px] top-[3px] block size-[1.125rem] rounded-full bg-ink-2',
          'transition-transform duration-150 ease-out data-[state=checked]:bg-on-key',
          'ltr:data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4',
        )}
      />
    </Switch.Root>
  )
}
