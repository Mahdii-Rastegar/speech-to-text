// Captures the main screen in its key states, for visual review after UI changes.
// Usage: start the dev server (`pnpm dev`), then `node scripts/screenshots.mjs`.
// Images land in test-results/screens/ (git-ignored).
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseURL = process.env.BASE_URL ?? 'http://localhost:5173'
const outDir = 'test-results/screens'

const START = 'شروع ضبط'
const STOP = 'پایان ضبط'

const viewports = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
}

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })

for (const [name, options] of Object.entries(viewports)) {
  const context = await browser.newContext({
    ...options,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
  })
  const page = await context.newPage()
  const shot = (state) => page.screenshot({ path: `${outDir}/${name}-${state}.png` })

  await page.goto(baseURL)
  await page.evaluate(() => document.fonts.ready)
  await shot('1-empty')

  await page.getByRole('button', { name: START }).click()
  // Mid-sentence, so the shot shows final text, interim text and the voice line together.
  await page.getByText('اگه تأخیرش زیر').waitFor({ timeout: 20_000 })
  await shot('2-recording')

  await page.getByRole('button', { name: STOP }).click()
  await page.getByRole('button', { name: START }).waitFor()
  await page.waitForTimeout(600)
  await shot('3-done-raw')

  await page.getByRole('tab', { name: 'پاک‌شده' }).click()
  await shot('4-clean-missing')
  await page.getByRole('button', { name: 'پاک‌سازی این متن' }).click()
  await page.getByText('نسخه‌ی پاک‌شده با AI').waitFor({ timeout: 10_000 })
  await shot('5-clean')

  await page.getByRole('switch').click()
  await page.getByRole('button', { name: 'خلاصه', exact: true }).click()
  await page.waitForTimeout(250)
  await shot('5b-ai-options-on')
  await page.getByRole('switch').click()

  await page.getByRole('button', { name: /تغییر موتور و زبان/ }).click()
  await page.waitForTimeout(300)
  await shot('6-engine-popover')
  await page.getByRole('radio', { name: /سرویس ناموجود/ }).click()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: START }).click()
  await page.getByRole('alert').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(300)
  await shot('7-error')

  if (options.isMobile) {
    await page.getByRole('button', { name: 'باز کردن تاریخچه' }).click()
    await page.waitForTimeout(450)
    await shot('8-history-sheet')
  }

  await context.close()
}

await browser.close()
console.log(`Saved screenshots to ${outDir}`)
