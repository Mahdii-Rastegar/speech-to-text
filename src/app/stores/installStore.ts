import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { IS_DESKTOP } from '@/app/services'
import {
  installPlatform,
  runsInstalled,
  watchInstall,
  type InstallPlatform,
} from '@/platform/web/install'

export type { InstallPlatform }

export interface InstallState {
  /**
   * The phone system whose steps the install guide shows. Null where there is
   * nothing to install: the desktop app, a computer's browser, or the web app
   * already opened from the home screen.
   */
  platform: InstallPlatform | null
  /** The browser offers to install on request, so the guide can show a button instead of steps. */
  canPrompt: boolean
  /** Installed during this visit; the page itself is still the browser tab. */
  installed: boolean
}

const platform = IS_DESKTOP || runsInstalled() ? null : installPlatform()

export const installStore = createStore<InstallState>(() => ({
  platform,
  canPrompt: false,
  installed: false,
}))

const watch = platform ? watchInstall((state) => installStore.setState(state)) : null

export async function promptInstall(): Promise<void> {
  if (await watch?.prompt()) installStore.setState({ installed: true })
}

export function useInstall<T>(selector: (state: InstallState) => T): T {
  return useStore(installStore, selector)
}
