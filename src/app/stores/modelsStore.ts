import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { FALLBACK_PROVIDER_ID, localModels, providers } from '@/app/services'
import type {
  DownloadProgress,
  LocalModelStatus,
  ModelFailureKind,
  SystemInfo,
} from '@/core/models/localModels'
import { settingsStore, updateSettings } from './settingsStore'

/** The local engine's models: what is on the disk, and what is on its way there. */
export interface ModelsState {
  models: LocalModelStatus[]
  /** Null until the platform has been asked, and where there is no local engine. */
  system: SystemInfo | null
  /** Downloads in progress, by model id. */
  downloading: Record<string, DownloadProgress>
  /** Why the latest download of a model ended early, by model id. */
  failures: Record<string, ModelFailureKind>
}

export const modelsStore = createStore<ModelsState>(() => ({
  models: [],
  system: null,
  downloading: {},
  failures: {},
}))

const without = <T>(record: Record<string, T>, id: string): Record<string, T> =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== id))

/** Asks the platform what it has. Without a local engine (the browser demo) there is nothing to ask. */
export async function loadModels(): Promise<void> {
  if (!localModels) return
  const [models, system] = await Promise.all([
    localModels.list().catch(() => []),
    localModels.system().catch(() => null),
  ])
  modelsStore.setState({ models, system })
}

/** When the local engine is set to a model that is not there, a freshly installed one takes its place. */
function chooseIfNoneUsable(id: string): void {
  const { models } = modelsStore.getState()
  const settings = settingsStore.getState()
  const provider = providers.get(settings.sttProviderId) ?? providers.get(FALLBACK_PROVIDER_ID)
  if (!provider?.getCapabilities().offline) return
  const chosen = models.find((model) => model.id === settings.sttModel)
  if (!chosen?.installed) updateSettings({ sttModel: id })
}

export async function downloadModel(id: string): Promise<void> {
  if (!localModels || modelsStore.getState().downloading[id]) return
  const model = modelsStore.getState().models.find((entry) => entry.id === id)
  const report = (progress: DownloadProgress) =>
    modelsStore.setState((state) => ({ downloading: { ...state.downloading, [id]: progress } }))

  modelsStore.setState((state) => ({ failures: without(state.failures, id) }))
  report({ received: model?.downloadedBytes ?? 0, total: model?.bytes ?? 0 })
  const outcome = await localModels.download(id, report)
  // The list is asked for first, so the row never shows "not downloaded" in between.
  await loadModels()
  modelsStore.setState((state) => ({
    downloading: without(state.downloading, id),
    failures:
      outcome.status === 'failed' ? { ...state.failures, [id]: outcome.kind } : state.failures,
  }))
  if (outcome.status === 'installed') chooseIfNoneUsable(id)
}

export function stopDownload(id: string): void {
  void localModels?.stop(id).catch(() => {})
}

/** Removes a model from the disk. Rejects when the platform could not. */
export async function removeModel(id: string): Promise<void> {
  if (!localModels) return
  try {
    await localModels.remove(id)
  } finally {
    await loadModels()
  }
}

export function useModels<T>(selector: (state: ModelsState) => T): T {
  return useStore(modelsStore, selector)
}
