import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { SETTINGS_STORAGE_KEY } from '@/app/config'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '@/core/settings'

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    return stored ? parseSettings(JSON.parse(stored)) : DEFAULT_SETTINGS
  } catch {
    // Storage can be unavailable (private mode) or hold broken JSON; defaults are always safe.
    return DEFAULT_SETTINGS
  }
}

export const settingsStore = createStore<Settings>(() => loadSettings())

settingsStore.subscribe((settings) => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Not being able to persist a preference must never interrupt the app.
  }
})

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.setState(patch)
}

export function useSettings<T>(selector: (settings: Settings) => T): T {
  return useStore(settingsStore, selector)
}
