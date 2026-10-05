import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { cloud } from '@/app/services'
import { checkKey } from '@/core/ai/chat'
import { CLOUD_PROVIDERS, type CloudProviderId } from '@/core/cloud/transport'
import type { AppError } from '@/core/errors'

/**
 * Which cloud services have a key stored. Only that fact lives here: the keys
 * themselves stay in the platform's secret store and are never read back.
 */
export type KeysState = Record<CloudProviderId, boolean>

export const keysStore = createStore<KeysState>(() => ({ openrouter: false, google: false }))

/** Asks the secret store what it holds. Without one (the browser demo) nothing is stored. */
export async function loadKeys(): Promise<void> {
  if (!cloud) return
  const { keys } = cloud
  const stored = await Promise.all(
    CLOUD_PROVIDERS.map((provider) => keys.has(provider).catch(() => false)),
  )
  keysStore.setState(
    Object.fromEntries(CLOUD_PROVIDERS.map((provider, index) => [provider, stored[index]])),
  )
}

/** Stores the key, replacing the previous one. Rejects when the secret store refuses it. */
export async function saveKey(provider: CloudProviderId, key: string): Promise<void> {
  if (!cloud) return
  await cloud.keys.set(provider, key)
  keysStore.setState({ [provider]: true })
}

export async function removeKey(provider: CloudProviderId): Promise<void> {
  if (!cloud) return
  await cloud.keys.remove(provider)
  keysStore.setState({ [provider]: false })
}

/** Asks the service whether the stored key works. Null means it does. */
export function testKey(provider: CloudProviderId): Promise<AppError | null> {
  return cloud ? checkKey(provider, cloud.transport) : Promise.resolve(null)
}

export function useKeys<T>(selector: (state: KeysState) => T): T {
  return useStore(keysStore, selector)
}
