import { expect, test } from '@playwright/test'
import { skipWelcome } from './helpers.ts'

const START = 'شروع ضبط'
const STOP = 'پایان ضبط'
const FIRST_WORDS = 'امروز باید روی AI Agent'

test.beforeEach(async ({ page }) => {
  await skipWelcome(page)
  await page.goto('/')
})

test('shows the empty page with an obvious way to start', async ({ page }) => {
  await expect(page).toHaveTitle('آوانویس')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('button', { name: START })).toBeVisible()
  await expect(page.getByText('برای شروع، دکمه‌ی ضبط را بزنید و صحبت کنید.')).toBeVisible()
})

test('records, shows live text, stops and copies the transcript', async ({ page }) => {
  await page.getByRole('button', { name: START }).click()

  await expect(page.getByRole('button', { name: STOP })).toBeVisible()
  await expect(page.getByText('در حال ضبط')).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByText(FIRST_WORDS)).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: STOP }).click()

  await expect(page.getByRole('button', { name: START })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'خام' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: 'کپی متن' }).click()
  await expect(page.getByRole('button', { name: 'کپی شد' })).toBeVisible()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain(FIRST_WORDS)
})

test('keeps the raw transcript untouched when AI makes a clean version', async ({ page }) => {
  await page.getByRole('button', { name: START }).click()
  await expect(page.getByText('API رو تست کنم')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: STOP }).click()
  await expect(page.getByRole('button', { name: START })).toBeVisible()

  const rawText = await page.locator('.transcript').innerText()

  await page.getByRole('tab', { name: 'پاک‌شده' }).click()
  await page.getByRole('button', { name: 'پاک‌سازی این متن' }).click()
  await expect(page.getByText('نسخه‌ی پاک‌شده با AI')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.transcript')).toContainText('بعد API رو تست کنم.')

  await page.getByRole('tab', { name: 'خام' }).click()
  await expect(page.locator('.transcript')).toHaveText(rawText)
})

test('makes the clean version and the summary by itself when AI processing is on', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'پاک‌سازی و اصلاح' })).toBeHidden()
  await page.getByRole('switch').click()
  await expect(page.getByRole('button', { name: 'پاک‌سازی و اصلاح' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'خلاصه', exact: true }).click()

  await page.getByRole('button', { name: START }).click()
  await expect(page.getByText('API رو تست کنم')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: STOP }).click()

  await page.getByRole('tab', { name: 'پاک‌شده' }).click()
  await expect(page.getByText('نسخه‌ی پاک‌شده با AI')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('tab', { name: 'خلاصه' }).click()
  await expect(page.getByText('خلاصه‌ی AI')).toBeVisible()
  await expect(page.locator('.transcript')).toContainText('تست API')
})

test('explains a provider failure and offers the local engine', async ({ page }) => {
  await page.getByRole('button', { name: /تغییر موتور و زبان/ }).click()
  await page.getByRole('radio', { name: /سرویس ناموجود/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /ابری · آنلاین/ })).toBeVisible()

  await page.getByRole('button', { name: START }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('تبدیل گفتار انجام نشد', { timeout: 10_000 })
  await expect(alert.getByRole('button', { name: 'تلاش دوباره' })).toBeVisible()

  await alert.getByRole('button', { name: 'ادامه با موتور محلی' }).click()
  await expect(page.getByRole('button', { name: STOP })).toBeVisible()
  await expect(page.getByRole('button', { name: /محلی · آفلاین/ })).toBeVisible()
})

test('opens a past session from History', async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole('button', { name: 'باز کردن تاریخچه' }).click()

  await page.getByRole('button', { name: /یادداشت جلسه‌ی معماری/ }).click()

  await expect(page.getByRole('heading', { name: 'یادداشت جلسه‌ی معماری' })).toBeVisible()
  await expect(page.locator('.transcript')).toContainText('TypeScript')

  await page.getByRole('tab', { name: 'خلاصه' }).click()
  await expect(page.getByText('خلاصه‌ی AI')).toBeVisible()
})
