import { defineConfig } from '@playwright/test'

const PORT = 5173
const baseURL = `http://localhost:${PORT}`

/**
 * End-to-end tests run in the Microsoft Edge that is already installed
 * (`channel: 'msedge'`), so no browser download is needed.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL,
    channel: 'msedge',
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
