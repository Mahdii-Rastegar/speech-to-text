import { FALLBACK_PROVIDER_ID, providers } from '@/app/services'
import { useSettings } from '@/app/stores/settingsStore'
import type { STTProvider } from '@/core/stt/provider'

/** The engine the next recording will use: the chosen one, or the fallback if it is not available here. */
export function useProvider(): STTProvider | undefined {
  const providerId = useSettings((settings) => settings.sttProviderId)
  return providers.get(providerId) ?? providers.get(FALLBACK_PROVIDER_ID)
}
