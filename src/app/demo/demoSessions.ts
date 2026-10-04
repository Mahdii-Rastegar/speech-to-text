import type { TranscriptionSession } from '@/core/session'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

type DemoSeed = Pick<
  TranscriptionSession,
  | 'durationMs'
  | 'language'
  | 'provider'
  | 'model'
  | 'title'
  | 'rawTranscript'
  | 'cleanTranscript'
  | 'summary'
  | 'cost'
> & { ageMs: number }

const SEEDS: DemoSeed[] = [
  {
    ageMs: 35 * MINUTE,
    durationMs: 134_000,
    language: 'fa',
    provider: 'demo-local',
    model: 'large-v3-turbo',
    title: 'یادداشت جلسه‌ی معماری',
    rawTranscript:
      'خب برای معماری تصمیم گرفتیم هسته‌ی برنامه با TypeScript نوشته بشه و بین نسخه‌ی دسکتاپ و PWA مشترک باشه provider ها هم پشت یه interface واحد قرار می‌گیرن که بعدا بشه راحت موتور جدید اضافه کرد',
    cleanTranscript:
      'برای معماری تصمیم گرفتیم هسته‌ی برنامه با TypeScript نوشته بشه و بین نسخه‌ی دسکتاپ و PWA مشترک باشه. providerها هم پشت یه interface واحد قرار می‌گیرن تا بعداً بشه راحت موتور جدید اضافه کرد.',
    summary: 'هسته‌ی مشترک با TypeScript برای دسکتاپ و PWA؛ providerها پشت یک interface واحد.',
    cost: { amountUsd: 0.0006, estimated: true },
  },
  {
    ageMs: 2 * HOUR + 10 * MINUTE,
    durationMs: 272_000,
    language: 'fa',
    provider: 'demo-cloud',
    model: 'whisper-large-v3',
    title: 'ایده‌ی ارسال transcript به Notion',
    rawTranscript:
      'یه ایده دارم که transcript هر جلسه رو بشه مستقیم به Notion فرستاد فعلا فقط یادداشتش می‌کنم که بعد از تموم شدن نسخه‌ی اول بهش فکر کنیم',
    cleanTranscript:
      'یه ایده دارم که transcript هر جلسه رو بشه مستقیم به Notion فرستاد. فعلاً فقط یادداشتش می‌کنم که بعد از تموم شدن نسخه‌ی اول بهش فکر کنیم.',
    summary: 'ایده: ارسال مستقیم transcript به Notion، بعد از نسخه‌ی اول.',
    cost: { amountUsd: 0.0033, estimated: true },
  },
  {
    ageMs: DAY + 3 * HOUR,
    durationMs: 48_000,
    language: 'fa',
    provider: 'demo-local',
    model: 'large-v3-turbo',
    title: null,
    rawTranscript:
      'فردا ساعت ده با تیم backend جلسه دارم باید قبلش endpoint های جدید رو مرور کنم و لیست سوال‌هام رو آماده کنم',
    cleanTranscript: null,
    summary: null,
    cost: null,
  },
  {
    ageMs: 3 * DAY + 5 * HOUR,
    durationMs: 191_000,
    language: 'fa',
    provider: 'demo-cloud',
    model: 'whisper-large-v3',
    title: 'کارهای این هفته',
    rawTranscript:
      'این هفته سه تا کار اصلی دارم اول تموم کردن benchmark مدل‌ها دوم نوشتن تست برای بخش ضبط صدا و سوم آماده کردن مستندات نصب',
    cleanTranscript:
      'این هفته سه تا کار اصلی دارم: اول، تموم کردن benchmark مدل‌ها؛ دوم، نوشتن تست برای بخش ضبط صدا؛ و سوم، آماده کردن مستندات نصب.',
    summary: 'سه کار هفته: benchmark مدل‌ها، تست ضبط صدا، مستندات نصب.',
    cost: { amountUsd: 0.0025, estimated: true },
  },
  {
    ageMs: 6 * DAY + 2 * HOUR,
    durationMs: 67_000,
    language: 'en',
    provider: 'demo-local',
    model: 'large-v3-turbo',
    title: null,
    rawTranscript:
      'Quick note for the release checklist. We need to bump the version, run the full test suite, and double check that no API keys are left in the repo before we make it public.',
    cleanTranscript: null,
    summary: null,
    cost: null,
  },
]

/** Sample History entries so the interface can be reviewed before real storage exists. */
export function createDemoSessions(now: Date): TranscriptionSession[] {
  return SEEDS.map(({ ageMs, ...seed }, index) => {
    const createdAt = new Date(now.getTime() - ageMs).toISOString()
    return {
      ...seed,
      id: `demo-session-${index + 1}`,
      createdAt,
      updatedAt: createdAt,
      source: 'microphone',
      status: 'done',
    }
  })
}
