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

test('records from the microphone chosen in settings', async ({ page }) => {
  await skipWelcome(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'تنظیمات' }).click()

  const microphones = page.getByRole('radiogroup', { name: 'میکروفون' })
  await expect(microphones.getByRole('radio', { name: /پیش‌فرض سیستم/ })).toBeChecked()
  const choice = microphones.getByRole('radio').nth(1)
  await choice.click()
  await expect(choice).toBeChecked()

  // The choice is what the next recording asks the browser for.
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('stt-app.settings.v1') ?? '{}').microphoneId,
  )
  expect(stored).toBeTruthy()
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = (constraints) => {
      const audio = constraints?.audio
      const id = typeof audio === 'object' ? audio.deviceId : undefined
      ;(window as unknown as { requestedMicrophone: unknown }).requestedMicrophone =
        typeof id === 'object' && !Array.isArray(id) ? id.exact : id
      return original(constraints)
    }
  })

  await page.getByRole('button', { name: 'بازگشت به صفحه‌ی اصلی' }).click()
  await page.getByRole('button', { name: START }).click()
  const dock = page.getByRole('region', { name: 'ضبط', exact: true })
  await expect(dock.getByText('صحبت', { exact: true })).toBeVisible({ timeout: 10_000 })
  expect(
    await page.evaluate(
      () => (window as unknown as { requestedMicrophone: unknown }).requestedMicrophone,
    ),
  ).toBe(stored)
  await page.getByRole('button', { name: STOP }).click()

  await page.reload()
  await page.getByRole('button', { name: 'تنظیمات' }).click()
  await expect(
    page.getByRole('radiogroup', { name: 'میکروفون' }).getByRole('radio').nth(1),
  ).toBeChecked()
})

test('falls back to the system microphone when the chosen one is gone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'stt-app.settings.v1',
      JSON.stringify({ onboarded: true, microphoneId: 'unplugged-microphone' }),
    )
  })
  await page.goto('/')
  await page.getByRole('button', { name: START }).click()

  await expect(page.getByText(/میکروفون انتخاب‌شده پیدا نشد/).first()).toBeAttached()
  const dock = page.getByRole('region', { name: 'ضبط', exact: true })
  await expect(dock.getByText('صحبت', { exact: true })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: STOP }).click()
})
