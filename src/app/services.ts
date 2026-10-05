import { createLevelMeter } from '@/audio/level'
import { createDemoAIProcessor } from '@/core/ai/providers/demo'
import { createDemoProvider } from '@/core/stt/providers/demo'
import { createProviderRegistry } from '@/core/stt/registry'
import {
  createLocalWhisperProvider,
  hasNativeEngine,
  LOCAL_WHISPER_ID,
} from '@/platform/tauri/localWhisper'

/**
 * Composition root: the one place that decides which engines exist.
 * The desktop app has the real local engine. Everything else is still a
 * scripted demo: the cloud engines, the AI step, and in the browser the local
 * engine too. The microphone and its level are real everywhere.
 */

/** Made-up list price so the cloud-styled demo can show an estimated cost. */
const DEMO_CLOUD_USD_PER_SECOND = 0.00001

const nativeEngine = hasNativeEngine()

/** Used when the stored choice is not available on this platform. */
export const FALLBACK_PROVIDER_ID = nativeEngine ? LOCAL_WHISPER_ID : 'demo-local'

/** Engines that play a script instead of recognizing speech. */
export const isDemoProvider = (id: string): boolean => id.startsWith('demo-')

export const providers = createProviderRegistry()

providers.register(
  nativeEngine
    ? createLocalWhisperProvider()
    : createDemoProvider({
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
