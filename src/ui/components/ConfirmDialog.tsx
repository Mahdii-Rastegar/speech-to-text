import { AlertDialog } from 'radix-ui'
import { fa } from '@/ui/strings/fa'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
}

/** Asks before something that cannot be undone. Cancel is the default choice. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-backdrop/75" />
        <AlertDialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-[24rem] -translate-y-1/2 animate-fade-in surface-float rounded-[1.125rem] border border-line-strong p-5">
          <AlertDialog.Title className="text-base leading-7 font-semibold text-ink">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-[0.9375rem] leading-7 text-ink-2">
            {body}
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel className="btn btn-secondary">{fa.nav.cancel}</AlertDialog.Cancel>
            <AlertDialog.Action onClick={onConfirm} className="btn btn-danger">
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
