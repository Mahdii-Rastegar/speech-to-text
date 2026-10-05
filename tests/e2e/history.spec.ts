import { expect, test, type Page } from '@playwright/test'
import { buildWav } from './fakeMicrophone.ts'
import { openHistory, skipWelcome } from './helpers.ts'

const START = 'شروع ضبط'
const STOP = 'پایان ضبط'
const FIRST_WORDS = 'امروز باید روی AI Agent'

/** How many sessions the browser's storage holds right now. */
function storedSessionCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open('stt-app.history')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const counting = opening.result.transaction('sessions').objectStore('sessions').count()
          counting.onsuccess = () => resolve(counting.result)
          counting.onerror = () => reject(counting.error)
        }
      }),
  )
}

test.beforeEach(async ({ page }) => {
  await skipWelcome(page)
  await page.goto('/')
})

test('keeps a recording in History after the app is reopened', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: START }).click()
  await expect(page.getByText(FIRST_WORDS)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: STOP }).click()
  await expect(page.getByRole('button', { name: START })).toBeVisible()
  // The write is still on its way when the text appears; a reload that instant would cut it off.
  await expect.poll(() => storedSessionCount(page)).toBe(6)

  await page.reload()
  await openHistory(page, isMobile)
  await expect(page.getByText('۶ جلسه')).toBeVisible()

  await page.getByRole('searchbox').fill('AI Agent')
  await expect(page.getByText('۱ نتیجه')).toBeVisible()
  await page.getByRole('main').getByRole('listitem').getByRole('button').first().click()
  await expect(page.locator('.transcript')).toContainText(FIRST_WORDS)
})

test('does not bring deleted sessions back', async ({ page, isMobile }) => {
  await openHistory(page, isMobile)
  await page.getByRole('button', { name: 'حذف همه' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'پاک کردن همه' }).click()
  await expect(page.getByRole('main').getByText('هنوز جلسه‌ای ضبط نشده است.')).toBeVisible()

  await page.reload()
  await openHistory(page, isMobile)
  await expect(page.getByText('۰ جلسه')).toBeVisible()
  await expect(page.getByRole('main').getByText('هنوز جلسه‌ای ضبط نشده است.')).toBeVisible()
})

test('turns an uploaded audio file into a stored session', async ({ page, isMobile }) => {
  await page.locator('input[type=file]').setInputFiles({
    name: 'note.wav',
    mimeType: 'audio/wav',
    buffer: buildWav(),
  })

  await expect(page.locator('.transcript')).toContainText(FIRST_WORDS, { timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'آپلود فایل صوتی' })).toBeEnabled()
  await expect(page.getByRole('tab', { name: 'خام' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('از فایل', { exact: true })).toBeVisible()

  await page.reload()
  await openHistory(page, isMobile)
  await expect(page.getByText('۶ جلسه')).toBeVisible()
})

test('explains a file that is not audio', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('this is not sound'),
  })

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('این فایل خوانده نشد')
  await expect(alert.getByRole('button', { name: 'تلاش دوباره' })).toBeHidden()
  await expect(page.getByRole('button', { name: START })).toBeEnabled()
})

test('cancels a long file and stores nothing of it', async ({ page, isMobile }) => {
  // Two minutes of sound: several requests, so there is time to change one's mind.
  await page.locator('input[type=file]').setInputFiles({
    name: 'meeting.wav',
    mimeType: 'audio/wav',
    buffer: buildWav(16),
  })

  await expect(page.getByRole('progressbar')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: START })).toBeDisabled()
  await page.getByRole('button', { name: 'لغو تبدیل فایل' }).click()

  await expect(page.getByRole('button', { name: START })).toBeEnabled()
  await expect(page.getByText('برای شروع، دکمه‌ی ضبط را بزنید و صحبت کنید.')).toBeVisible()
  // Long enough for the request that was under way to come back and be ignored.
  await page.waitForTimeout(1500)
  await openHistory(page, isMobile)
  await expect(page.getByText('۵ جلسه')).toBeVisible()
})
