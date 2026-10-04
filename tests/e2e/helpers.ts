import type { Page } from '@playwright/test'

const SETTINGS_KEY = 'stt-app.settings.v1'

/** Starts the app as a returning user, so tests land on the main screen instead of the welcome. */
export async function skipWelcome(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify({ onboarded: true }))
    }
  }, SETTINGS_KEY)
}

/** Opens the full History screen from wherever its entry point is at this screen size. */
export async function openHistory(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) await page.getByRole('button', { name: 'باز کردن تاریخچه' }).click()
  await page.getByRole('button', { name: 'جست‌وجو در تاریخچه' }).click()
}
