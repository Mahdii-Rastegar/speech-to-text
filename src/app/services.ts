import { createLevelMeter } from '@/audio/level'
import { createDemoAIProcessor } from '@/core/ai/providers/demo'
import { createDemoProvider } from '@/core/stt/providers/demo'
import { createProviderRegistry } from '@/core/stt/registry'

/**
 * Composition root: the one place that decides which engines exist.
 * Until the real engines arrive, every provider here is a scripted demo;
 * the microphone and its level are real.
 */

/** Made-up list price so the cloud-styled demo can show an estimated cost. */
const DEMO_CLOUD_USD_PER_SECOND = 0.00001

export const FALLBACK_PROVIDER_ID = 'demo-local'

export const providers = createProviderRegistry()

providers.register(
  createDemoProvider({
    id: 'demo-local',
    kind: 'local',
    models: [{ id: 'large-v3-turbo' }],
    usdPerAudioSecond: null,
  }),
)
providers.register(
  createDemoProvider({
    id: 'demo-cloud',
    kind: 'cloud',
    models: [{ id: 'whisper-large-v3' }],
    usdPerAudioSecond: DEMO_CLOUD_USD_PER_SECOND,
  }),
)
providers.register(
  createDemoProvider({
    id: 'demo-failing',
    kind: 'cloud',
    models: [{ id: 'whisper-large-v3' }],
    usdPerAudioSecond: DEMO_CLOUD_USD_PER_SECOND,
    failAfterMs: 2600,
  }),
)

export const aiProcessor = createDemoAIProcessor()

/** Loudness of the microphone while recording; silent otherwise. */
export const levelSource = createLevelMeter()
