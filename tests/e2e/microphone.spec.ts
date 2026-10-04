import { expect, test, type Page } from '@playwright/test'
import { skipWelcome } from './helpers.ts'

const START = 'شروع ضبط'
const STOP = 'پایان ضبط'

/** Makes the browser answer the microphone request with a failure, as it does on a real refusal. */
async function failMicrophoneWith(page: Page, errorName: string): Promise<void> {
  await page.addInitScript((name) => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Simulated', name))
  }, errorName)
}

test('tells speech from silence in what the microphone hears', async ({ page }) => {
  await skipWelcome(page)
  await page.goto('/')
  await page.getByRole('button', { name: START }).click()

  const dock = page.getByRole('region', { name: 'ضبط', exact: true })
  // The generated microphone talks for six seconds, pauses, and talks again.
  await expect(dock.getByText('صحبت', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(dock.getByText('سکوت', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(dock.getByText('صحبت', { exact: true })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: STOP }).click()
  await expect(page.getByRole('button', { name: START })).toBeVisible()
  await expect(dock.getByText('صحبت', { exact: true })).toBeHidden()
})

test('explains what to do when the microphone is not allowed', async ({ page }) => {
  await failMicrophoneWith(page, 'NotAllowedError')
  await skipWelcome(page)
  await page.goto('/')
  await page.getByRole('button', { name: START }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('دسترسی به میکروفون داده نشده است')
  await expect(alert.getByRole('button', { name: 'ادامه با موتور محلی' })).toBeHidden()
  await expect(page.getByRole('button', { name: START })).toBeEnabled()
})

test('offers another try when no microphone is connected', async ({ page }) => {
  await failMicrophoneWith(page, 'NotFoundError')
  await skipWelcome(page)
  await page.goto('/')
  await page.getByRole('button', { name: START }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('میکروفونی پیدا نشد')
  await expect(alert.getByRole('button', { name: 'تلاش دوباره' })).toBeVisible()
})
