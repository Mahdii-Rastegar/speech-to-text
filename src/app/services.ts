import { decodeAudioFile } from '@/audio/decodeFile'
import { createLevelMeter } from '@/audio/level'
import { createDemoAIProcessor } from '@/core/ai/providers/demo'
import type { HistoryRepository } from '@/core/history/repository'
import { createDemoProvider } from '@/core/stt/providers/demo'
import { createProviderRegistry } from '@/core/stt/registry'
import { createNativeHistory } from '@/platform/tauri/history'
import {
  createLocalWhisperProvider,
  decodeWithNativeCodecs,
  hasNativeEngine,
  LOCAL_WHISPER_ID,
} from '@/platform/tauri/localWhisper'
import { createBrowserHistory } from '@/platform/web/history'

/**
 * Composition root: the one place that decides which engines exist and where
 * History is kept. The desktop app has the real local engine. Everything else
 * is still a scripted demo: the cloud engines, the AI step, and in the browser
 * the local engine too. The microphone, its level and History are real everywhere.
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

/** An uploaded file as 16 kHz mono. The desktop app also reads what the web view cannot. */
export const decodeFile = (file: Blob): Promise<Float32Array> =>
  decodeAudioFile(file, nativeEngine ? decodeWithNativeCodecs : undefined)

/** A database file beside the desktop app; the browser's own storage on the web. */
export const history: HistoryRepository = nativeEngine
  ? createNativeHistory()
  : createBrowserHistory()

/** The browser build is a demo: its History starts with a few sample sessions. */
export const SEEDS_DEMO_HISTORY = !nativeEngine

/** Loudness of the microphone while recording; silent otherwise. */
export const levelSource = createLevelMeter()
