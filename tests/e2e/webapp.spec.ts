import { expect, test, type Page } from '@playwright/test'
import { skipWelcome } from './helpers.ts'

/**
 * The real web app (what the iPhone installs), from a production build. The
 * cloud service is played by the test, so no key and no connection are needed.
 */

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const KEY = 'test-key-not-a-real-one'
const HEARD = 'این متن را سرویس ابری برگرداند.'
const KEY_LABEL = 'کلید Google AI Studio'

interface Sent {
  url: string
  key: string | undefined
}

/** Answers as Gemini would, and notes every request that leaves this site. */
async function playGemini(page: Page): Promise<{ toGemini: Sent[]; elsewhere: string[] }> {
  const toGemini: Sent[] = []
  const elsewhere: string[] = []
  await page.route(
    (url) => url.hostname !== 'localhost',
    async (route) => {
      const request = route.request()
      if (!request.url().startsWith(`${GEMINI}/`)) {
        elsewhere.push(request.url())
        return route.abort()
      }
      toGemini.push({ url: request.url(), key: request.headers()['x-goog-api-key'] })
      if (request.method() === 'GET') return route.fulfill({ json: { models: [] } })
      return route.fulfill({
        json: { candidates: [{ content: { parts: [{ text: HEARD }] }, finishReason: 'STOP' }] },
      })
    },
  )
  return { toGemini, elsewhere }
}

/** Everything the page has put in the browser's storage, as text. */
const storedText = (page: Page): Promise<string> =>
  page.evaluate(async () => {
    const decoder = new TextDecoder()
    const readable = (value: unknown): unknown => {
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return decoder.decode(value)
      if (value instanceof CryptoKey) return { extractable: value.extractable }
      return value
    }
    const dump: unknown[] = [{ ...localStorage }, { ...sessionStorage }]
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      for (const store of Array.from(database.objectStoreNames)) {
        const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
          const request = database.transaction(store).objectStore(store).getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        for (const row of rows) {
          dump.push(
            Object.fromEntries(Object.entries(row).map(([name, value]) => [name, readable(value)])),
          )
        }
      }
      database.close()
    }
    return JSON.stringify(dump)
  })

async function storeKey(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'تنظیمات' }).click()
  await page.getByLabel(KEY_LABEL, { exact: true }).fill(KEY)
  await page.getByRole('button', { name: `ذخیره ${KEY_LABEL}` }).click()
  await expect(page.getByText('سرویس این کلید را پذیرفت.')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await skipWelcome(page)
})

test('keeps the key encrypted and sends it only to its own service', async ({ page }) => {
  const { toGemini, elsewhere } = await playGemini(page)
  await page.goto('/')
  await storeKey(page)
  await expect(page.getByLabel(KEY_LABEL, { exact: true })).toHaveValue('')

  const stored = await storedText(page)
  expect(stored).not.toContain(KEY)
  expect(stored).toContain('{"extractable":false}')

  // The key is still there after a restart, and still not shown.
  await page.reload()
  await page.getByRole('button', { name: 'تنظیمات' }).click()
  await expect(page.getByText('کلید ذخیره شده است.')).toBeVisible()
  await expect(page.getByLabel(KEY_LABEL, { exact: true })).toHaveValue('')

  expect(toGemini.length).toBeGreaterThan(0)
  expect(toGemini.every((request) => request.key === KEY)).toBe(true)
  expect(elsewhere).toEqual([])
})

test('turns a recording into text through the cloud engine', async ({ page }) => {
  const { toGemini, elsewhere } = await playGemini(page)
  await page.goto('/')
  await storeKey(page)
  await page.getByRole('button', { name: 'بازگشت به صفحه‌ی اصلی' }).click()

  await page.getByRole('button', { name: 'شروع ضبط' }).click()
  await expect(page.getByRole('button', { name: 'پایان ضبط' })).toBeVisible()
  // The first sentence is sent when the speaker pauses, and comes back as text.
  await expect(page.locator('.transcript')).toContainText(HEARD, { timeout: 30_000 })
  await page.getByRole('button', { name: 'پایان ضبط' }).click()
  await expect(page.getByRole('button', { name: 'شروع ضبط' })).toBeVisible()

  const transcriptions = toGemini.filter((request) => request.url.endsWith(':generateContent'))
  expect(transcriptions.length).toBeGreaterThan(0)
  expect(transcriptions.every((request) => request.key === KEY)).toBe(true)
  expect(elsewhere).toEqual([])
})

test('says so when no key is stored', async ({ page }) => {
  await playGemini(page)
  await page.goto('/')

  await page.getByRole('button', { name: 'شروع ضبط' }).click()
  await expect(page.getByRole('alert')).toContainText('کلید API وارد نشده است')
})
