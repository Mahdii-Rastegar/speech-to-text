import { expect, test } from '@playwright/test'
import { skipWelcome } from './helpers.ts'

/**
 * The guide to putting the web app on the home screen. It is for phones only,
 * so these tests introduce the browser as one; every other test runs without
 * it, which is the proof that a computer never sees the guide.
 */

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

const TITLE = 'آوانویس را روی گوشی نصب کنید'
const SKIP = 'فعلاً در مرورگر ادامه می‌دهم'

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE })

  test('explains the steps first, can be skipped, and stays away afterwards', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
    await expect(page.getByText('Add to Home Screen را انتخاب کنید')).toBeVisible()
    await expect(page.getByText('بدون نصب، تاریخچه ماندگار نیست')).toBeVisible()
    await expect(page.getByText(/هفت روز/)).toBeVisible()

    await page.getByRole('button', { name: SKIP }).click()
    await expect(page.getByText('به آوانویس خوش آمدید')).toBeVisible()

    await page.reload()
    await expect(page.getByText('به آوانویس خوش آمدید')).toBeVisible()
    await expect(page.getByRole('heading', { name: TITLE })).toBeHidden()
  })

  test('can be opened again from Settings', async ({ page, isMobile }) => {
    await skipWelcome(page)
    await page.goto('/')
    await page.getByRole('button', { name: SKIP }).click()

    if (isMobile) await page.getByRole('button', { name: 'باز کردن تاریخچه' }).click()
    await page.getByRole('button', { name: 'تنظیمات' }).click()
    await page.getByRole('button', { name: 'راهنمای نصب' }).click()
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()
  })
})

test.describe('on Android', () => {
  test.use({ userAgent: ANDROID })

  test('installs with one button when the browser offers to', async ({ page }) => {
    await skipWelcome(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible()

    // The browser's offer, played by the test: the real one needs a person to accept it.
    await page.evaluate(() => {
      const offer = Object.assign(new Event('beforeinstallprompt'), {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      })
      window.dispatchEvent(offer)
    })
    await page.getByRole('button', { name: 'نصب برنامه' }).click()
    await expect(page.getByRole('heading', { name: 'نصب شد' })).toBeVisible()

    await page.getByRole('button', { name: 'ادامه', exact: true }).click()
    await expect(page.getByRole('button', { name: 'شروع ضبط' })).toBeVisible()
  })
})
