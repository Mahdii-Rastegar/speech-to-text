import { expect, test } from '@playwright/test'
import { openHistory, skipWelcome } from './helpers.ts'

const START = 'شروع ضبط'

test.describe('welcome', () => {
  test('greets a first-time user once and remembers the language choice', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('به آوانویس خوش آمدید')).toBeVisible()
    await expect(page.getByRole('button', { name: START })).toBeHidden()

    await page.getByRole('radio', { name: 'فارسی' }).click()
    await page.getByRole('button', { name: 'شروع کنید' }).click()
    await expect(page.getByRole('button', { name: START })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: START })).toBeVisible()
    await page.getByRole('button', { name: /تغییر موتور و زبان/ }).click()
    await expect(page.getByRole('radio', { name: 'فارسی' })).toBeChecked()
  })
})

test.describe('history', () => {
  test.beforeEach(async ({ page }) => {
    await skipWelcome(page)
    await page.goto('/')
  })

  test('searches sessions and opens a result', async ({ page, isMobile }) => {
    await openHistory(page, isMobile)
    await expect(page.getByRole('heading', { name: 'تاریخچه' })).toBeVisible()
    await expect(page.getByText('۵ جلسه')).toBeVisible()

    const search = page.getByRole('searchbox')
    await search.fill('notion')
    await expect(page.getByText('۱ نتیجه')).toBeVisible()

    await search.fill('چیزی که نیست')
    await expect(page.getByText('چیزی با این جست‌وجو پیدا نشد.')).toBeVisible()

    await search.fill('notion')
    await page
      .getByRole('main')
      .getByRole('button', { name: /ایده‌ی ارسال transcript به Notion/ })
      .click()
    await expect(page.getByRole('button', { name: START })).toBeVisible()
    await expect(page.locator('.transcript')).toContainText('Notion')
  })

  test('deletes a session only after confirmation', async ({ page, isMobile }) => {
    await openHistory(page, isMobile)
    const row = page.getByRole('main').getByRole('listitem').filter({ hasText: 'کارهای این هفته' })

    await row.getByRole('button', { name: 'حذف جلسه' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'انصراف' }).click()
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'حذف جلسه' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'حذف', exact: true }).click()
    await expect(row).toBeHidden()
    await expect(page.getByText('۴ جلسه')).toBeVisible()
  })

  test('clears the whole history', async ({ page, isMobile }) => {
    await openHistory(page, isMobile)
    await page.getByRole('button', { name: 'حذف همه' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'پاک کردن همه' }).click()
    await expect(page.getByRole('main').getByText('هنوز جلسه‌ای ضبط نشده است.')).toBeVisible()
  })
})

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await skipWelcome(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'تنظیمات' }).click()
  })

  test('changes the engine and AI options, and keeps them', async ({ page }) => {
    await page.getByRole('radio', { name: /OpenRouter/ }).click()
    await page.getByRole('switch', { name: /پردازش با AI/ }).click()
    await expect(page.getByRole('switch', { name: /خلاصه/ })).toBeEnabled()

    await page.getByRole('button', { name: 'بازگشت به صفحه‌ی اصلی' }).click()
    await expect(page.getByRole('button', { name: /ابری · آنلاین/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'پاک‌سازی و اصلاح' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: /ابری · آنلاین/ })).toBeVisible()
  })

  test('never stores the API key in the demo', async ({ page }) => {
    const field = page.getByLabel('کلید OpenRouter', { exact: true })
    await field.fill('sk-or-test-not-a-real-key')
    await expect(field).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'ذخیره کلید OpenRouter' }).click()

    await expect(field).toHaveValue('')
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
    expect(stored).not.toContain('sk-or-test')
  })

  test('previews an error message and leads back to settings', async ({ page }) => {
    await page.getByRole('button', { name: 'کلید API پذیرفته نشد' }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('کلید API پذیرفته نشد')
    await alert.getByRole('button', { name: 'باز کردن تنظیمات' }).click()
    await expect(page.getByRole('heading', { name: 'تنظیمات', exact: true })).toBeVisible()
  })

  test('shows the welcome screen again on request', async ({ page }) => {
    await page.getByRole('button', { name: 'دیدن دوباره‌ی صفحه‌ی خوش‌آمد' }).click()
    await expect(page.getByText('به آوانویس خوش آمدید')).toBeVisible()
  })
})
