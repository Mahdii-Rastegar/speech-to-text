import { decodeAudioFile } from '@/audio/decodeFile'
import { createLevelMeter } from '@/audio/level'
import { createChatClient, DEFAULT_AI_MODELS } from '@/core/ai/chat'
import type { AIProcessor } from '@/core/ai/processor'
import { createChatAIProcessor } from '@/core/ai/providers/chat'
import { createDemoAIProcessor } from '@/core/ai/providers/demo'
import { CLOUD_PROVIDERS, type CloudAccess } from '@/core/cloud/transport'
import type { HistoryRepository } from '@/core/history/repository'
import type { LocalModels } from '@/core/models/localModels'
import type { Settings } from '@/core/settings'
import { createCloudSttProvider } from '@/core/stt/providers/cloud'
import { createDemoProvider } from '@/core/stt/providers/demo'
import { createProviderRegistry } from '@/core/stt/registry'
import { createNativeCloud } from '@/platform/tauri/cloud'
import { createNativeHistory } from '@/platform/tauri/history'
import {
  createLocalWhisperProvider,
  decodeWithNativeCodecs,
  hasNativeEngine,
  LOCAL_WHISPER_ID,
} from '@/platform/tauri/localWhisper'
import { createNativeModels } from '@/platform/tauri/models'
import { createBrowserCloud } from '@/platform/web/cloud'
import { createBrowserHistory } from '@/platform/web/history'

/**
 * Composition root: the one place that decides which engines exist and where
 * History is kept. There are three builds:
 *
 * - the desktop app: the real local engine, keys in the system's own store,
 *   and the cloud engines and the AI step on top of them;
 * - the web app (the iPhone PWA): no local engine; the cloud engines and the
 *   AI step straight from the browser, with the key kept in its storage;
 * - the demo, which is what the development server shows and the end-to-end
 *   tests run against: scripted engines and a scripted AI step, no keys.
 *
 * The microphone, its level and History are real everywhere.
 */

/** Made-up list price so the cloud-styled demo can show an estimated cost. */
const DEMO_CLOUD_USD_PER_SECOND = 0.00001

const nativeEngine = hasNativeEngine()

/** VITE_DEMO=1 shows the demo in a built web app, VITE_DEMO=0 the real web app in development. */
const demoChoice: unknown = import.meta.env.VITE_DEMO
const demo =
  !nativeEngine && (typeof demoChoice === 'string' ? demoChoice === '1' : import.meta.env.DEV)

/** True in the desktop app. The web builds keep keys and reach services differently. */
export const IS_DESKTOP = nativeEngine

/** Whether speech can be turned into text on this device at all. */
export const HAS_LOCAL_ENGINE = nativeEngine || demo

/**
 * Used when the stored choice is not available on this platform. On the web
 * that is Gemini, which the project's own tests found better at Persian.
 */
export const FALLBACK_PROVIDER_ID = nativeEngine ? LOCAL_WHISPER_ID : demo ? 'demo-local' : 'google'

/** Engines that play a script instead of recognizing speech. */
export const isDemoProvider = (id: string): boolean => id.startsWith('demo-')

/** Keys and requests for the cloud services. Null in the demo, which has neither. */
export const cloud: CloudAccess | null = nativeEngine
  ? createNativeCloud()
  : demo
    ? null
    : createBrowserCloud()

export const providers = createProviderRegistry()

if (nativeEngine) {
  providers.register(createLocalWhisperProvider())
} else if (demo) {
  providers.register(
    createDemoProvider({
      id: 'demo-local',
      kind: 'local',
      models: [{ id: 'large-v3-turbo' }],
      usdPerAudioSecond: null,
    }),
  )
}
if (cloud) {
  for (const service of CLOUD_PROVIDERS) providers.register(createCloudSttProvider(service, cloud))
} else {
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
}

/** The local engine's model files. Null where there is no local engine to keep them for. */
export const localModels: LocalModels | null = nativeEngine ? createNativeModels() : null

const demoAiProcessor = createDemoAIProcessor()

/** The model an AI request goes to: the user's choice, or the service's default. */
export const aiModelOf = (settings: Settings): string =>
  settings.aiModel || DEFAULT_AI_MODELS[settings.aiProviderId]

/** The AI step as the settings describe it right now. */
export function createAiProcessor(settings: Settings): AIProcessor {
  if (!cloud) return demoAiProcessor
  return createChatAIProcessor(createChatClient(settings.aiProviderId, cloud.transport), {
    model: aiModelOf(settings),
    glossary: settings.glossary,
  })
}

/** An uploaded file as 16 kHz mono. The desktop app also reads what the web view cannot. */
export const decodeFile = (file: Blob): Promise<Float32Array> =>
  decodeAudioFile(file, nativeEngine ? decodeWithNativeCodecs : undefined)

/** A database file beside the desktop app; the browser's own storage on the web. */
export const history: HistoryRepository = nativeEngine
  ? createNativeHistory()
  : createBrowserHistory()

/** The demo's History starts with a few sample sessions. */
export const SEEDS_DEMO_HISTORY = demo

/** Loudness of the microphone while recording; silent otherwise. */
export const levelSource = createLevelMeter()
