/**
 * Putting the web app on a phone's home screen. An iPhone has no way for a
 * page to install itself, so the guide can only describe the steps; Chrome on
 * Android hands the page an event whose `prompt()` opens the system's own
 * install dialog.
 */

export type InstallPlatform = 'ios' | 'android'

/** Chrome's `beforeinstallprompt`, which the DOM typings do not describe. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** The phone system this browser runs on, or null on a computer. */
export function installPlatform(): InstallPlatform | null {
  const agent = navigator.userAgent
  if (/android/i.test(agent)) return 'android'
  if (/iphone|ipad|ipod/i.test(agent)) return 'ios'
  // An iPad introduces itself as a Mac; its touch screen gives it away.
  if (/macintosh/i.test(agent) && navigator.maxTouchPoints > 1) return 'ios'
  return null
}

/** True when the app was opened from the home screen rather than in a browser tab. */
export function runsInstalled(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export interface InstallWatch {
  /** Opens the system's install dialog. Resolves to whether the user agreed. */
  prompt(): Promise<boolean>
}

/**
 * Listens for the browser's offer to install and for the installation itself.
 * It has to start at load: the offer comes once, early, and is lost otherwise.
 */
export function watchInstall(
  onChange: (state: { canPrompt?: boolean; installed?: boolean }) => void,
): InstallWatch {
  let offer: InstallPromptEvent | null = null

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keeps Chrome's own banner away; the guide offers the same thing with an explanation.
    event.preventDefault()
    offer = event as InstallPromptEvent
    onChange({ canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    onChange({ canPrompt: false, installed: true })
  })

  return {
    async prompt() {
      const current = offer
      if (!current) return false
      // An offer can be used once, whatever the answer.
      offer = null
      onChange({ canPrompt: false })
      try {
        await current.prompt()
        return (await current.userChoice).outcome === 'accepted'
      } catch {
        return false
      }
    },
  }
}
