import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { copyText } from '@/app/clipboard'
import { notify } from '@/app/stores/uiStore'
import { cn } from '@/ui/format'
import { fa } from '@/ui/strings/fa'

const CONFIRMATION_MS = 1800

/** Copies the version of the transcript that is on screen and confirms it on the button itself. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    const succeeded = await copyText(text)
    setCopied(succeeded)
    notify(succeeded ? 'copied' : 'copy-failed')
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={text.length === 0}
      className={cn(
        'btn min-w-[6.5rem] rounded-full border shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]',
        copied
          ? 'border-live/60 bg-live/10 text-live'
          : 'border-line-strong bg-raised text-ink hover:bg-hover',
      )}
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4 animate-pop-in" strokeWidth={2.5} />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      {copied ? fa.copy.done : fa.copy.idle}
    </button>
  )
}
