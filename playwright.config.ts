import { defineConfig } from '@playwright/test'
import { fakeMicrophoneArgs } from './tests/e2e/fakeMicrophone.ts'

const PORT = 5173
const baseURL = `http://localhost:${PORT}`
/** The built web app, which is the real one: cloud engines, keys in the browser. */
const WEB_APP_PORT = 4173
const webAppURL = `http://localhost:${WEB_APP_PORT}`
const WEB_APP_TESTS = /webapp\.spec\.ts/

/**
 * End-to-end tests run in the Microsoft Edge that is already installed
 * (`channel: 'msedge'`), so no browser download is needed. The microphone is
 * a generated sound file, so tests need no audio hardware and hear no one.
 *
 * Most tests run against the development server, that is the demo. The
 * `web-app` project runs against a production build, with the cloud service
 * answered by the test itself.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // The microphone plays in real time, so a test that listens to it fails when the
  // computer is too busy to keep up: fewer browsers at once, and more patience.
  workers: 4,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL,
    channel: 'msedge',
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    permissions: ['clipboard-read', 'clipboard-write', 'microphone'],
    launchOptions: { args: fakeMicrophoneArgs() },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: WEB_APP_TESTS,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      testIgnore: WEB_APP_TESTS,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'web-app',
      testMatch: WEB_APP_TESTS,
      use: {
        baseURL: webAppURL,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        // Requests that pass through a service worker are out of the test's reach.
        serviceWorkers: 'block',
      },
    },
  ],
  webServer: [
    {
      command: `pnpm exec vite --port ${PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `pnpm build && pnpm exec vite preview --port ${WEB_APP_PORT} --strictPort`,
      url: webAppURL,
      // Always a fresh build: an old one would test code that is no longer there.
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
