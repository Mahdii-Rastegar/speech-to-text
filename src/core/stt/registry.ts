import type { STTProvider } from './provider'

export interface ProviderRegistry {
  register(provider: STTProvider): void
  get(id: string): STTProvider | undefined
  list(): STTProvider[]
}

/** Engines register here; adding one never requires touching the transcription flow. */
export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, STTProvider>()
  return {
    register(provider) {
      if (providers.has(provider.id)) {
        throw new Error(`STT provider "${provider.id}" is already registered`)
      }
      providers.set(provider.id, provider)
    },
    get: (id) => providers.get(id),
    list: () => [...providers.values()],
  }
}
