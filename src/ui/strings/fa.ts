import type { NoticeKind } from '@/app/stores/uiStore'
import type { AppErrorKind } from '@/core/errors'
import type { LanguageSetting, TranscriptVersion } from '@/core/session'

/**
 * Every piece of interface text lives here, so wording can be reviewed in one
 * place and another language can be added without touching components.
 */

const versions: Record<TranscriptVersion, string> = {
  raw: 'خام',
  clean: 'پاک‌شده',
  summary: 'خلاصه',
}

const languages: Record<LanguageSetting, string> = {
  auto: 'خودکار',
  fa: 'فارسی',
  en: 'English',
}

const notices: Record<NoticeKind, string> = {
  'recording-started': 'ضبط شروع شد',
  'recording-stopped': 'ضبط تمام شد و متن ذخیره شد',
  'nothing-recorded': 'چیزی ضبط نشد',
  copied: 'کپی شد',
  'copy-failed': 'کپی انجام نشد. متن را انتخاب و دستی کپی کنید.',
  'ai-finished': 'پردازش AI تمام شد',
  'ai-failed': 'پردازش AI انجام نشد. متن خام دست‌نخورده است.',
  'coming-soon': 'این بخش در فازهای بعدی اضافه می‌شود',
}

const errors: Record<AppErrorKind, { title: string; body: string }> = {
  'mic-permission-denied': {
    title: 'دسترسی به میکروفون داده نشده است',
    body: 'در تنظیمات مرورگر یا سیستم، اجازه‌ی میکروفون را برای این برنامه روشن کنید.',
  },
  'mic-unavailable': {
    title: 'میکروفونی پیدا نشد',
    body: 'اتصال میکروفون را بررسی کنید و دوباره تلاش کنید.',
  },
  'live-unsupported': {
    title: 'این موتور هنوز حالت زنده ندارد',
    body: 'موتور دیگری انتخاب کنید یا با موتور محلی ادامه دهید.',
  },
  'provider-unavailable': {
    title: 'تبدیل گفتار انجام نشد',
    body: 'سرویس انتخاب‌شده پاسخ نداد.',
  },
  'provider-blocked': {
    title: 'این سرویس از شبکه‌ی فعلی در دسترس نیست',
    body: 'VPN را روشن کنید و دوباره تلاش کنید، یا با موتور محلی ادامه دهید.',
  },
  'invalid-api-key': {
    title: 'کلید API پذیرفته نشد',
    body: 'کلید را در تنظیمات بررسی کنید.',
  },
  'rate-limited': {
    title: 'سقف استفاده از سرویس پر شده است',
    body: 'کمی بعد دوباره تلاش کنید، یا با موتور محلی ادامه دهید.',
  },
  'model-unavailable': {
    title: 'مدل انتخاب‌شده در دسترس نیست',
    body: 'مدل دیگری را در تنظیمات انتخاب کنید.',
  },
  offline: {
    title: 'اتصال اینترنت برقرار نیست',
    body: 'موتور محلی بدون اینترنت کار می‌کند.',
  },
  timeout: {
    title: 'پاسخ سرویس بیش از حد طول کشید',
    body: 'دوباره تلاش کنید، یا با موتور محلی ادامه دهید.',
  },
  unknown: {
    title: 'مشکلی پیش آمد',
    body: 'دوباره تلاش کنید.',
  },
}

/** Display names for engines. Unknown ids fall back to the id itself. */
const providers: Record<string, { name: string; hint?: string }> = {
  'demo-local': { name: 'Whisper محلی' },
  'demo-cloud': { name: 'OpenRouter' },
  'demo-failing': { name: 'سرویس ناموجود', hint: 'برای دیدن حالت خطا' },
}

export const fa = {
  demo: {
    badge: 'نمایشی',
    note: 'نسخه‌ی نمایشی: متن‌ها نمونه‌اند و صدایی ضبط نمی‌شود.',
  },
  recorder: {
    region: 'ضبط',
    start: 'شروع ضبط',
    stop: 'پایان ضبط',
    starting: 'در حال آماده‌سازی…',
    recording: 'در حال ضبط',
    finalizing: 'در حال نهایی‌سازی متن…',
    elapsed: 'زمان سپری‌شده',
    upload: 'آپلود فایل صوتی',
  },
  ai: {
    group: 'پردازش بعد از ضبط',
    master: 'پردازش با AI',
    clean: 'پاک‌سازی و اصلاح',
    summary: 'خلاصه',
  },
  versions,
  versionsLabel: 'نسخه‌ی متن',
  copy: {
    idle: 'کپی متن',
    done: 'کپی شد',
  },
  transcript: {
    heroLead: 'صدای شما،',
    heroRest: 'همان لحظه متن می‌شود.',
    emptyTitle: 'برای شروع، دکمه‌ی ضبط را بزنید و صحبت کنید.',
    emptyBody: 'متن همین‌جا، هم‌زمان با صحبت شما نوشته می‌شود.',
    capturedSoFar: 'متن ثبت‌شده تا این لحظه',
    availableAfterStop: 'بعد از پایان ضبط در دسترس است',
    cleanCaption: 'نسخه‌ی پاک‌شده با AI',
    summaryCaption: 'خلاصه‌ی AI',
    cleanMissing: 'برای این جلسه نسخه‌ی پاک‌شده ساخته نشده است.',
    summaryMissing: 'برای این جلسه خلاصه‌ای ساخته نشده است.',
    makeClean: 'پاک‌سازی این متن',
    makeSummary: 'خلاصه کردن این متن',
    cleaning: 'در حال پاک‌سازی متن…',
    summarizing: 'در حال خلاصه کردن…',
  },
  session: {
    estimatedCost: 'هزینه‌ی تخمینی',
    cost: 'هزینه',
    dollars: 'دلار',
  },
  status: {
    local: 'محلی · آفلاین',
    cloud: 'ابری · آنلاین',
    change: 'تغییر موتور و زبان',
    engineTitle: 'موتور تبدیل گفتار',
    languageTitle: 'زبان گفتار',
    localPrivacy: 'صدا روی همین دستگاه می‌ماند.',
    cloudPrivacy: 'صدا برای سرویس انتخاب‌شده فرستاده می‌شود.',
    lockedWhileRecording: 'هنگام ضبط قابل تغییر نیست',
  },
  languages,
  providers,
  history: {
    title: 'تاریخچه',
    open: 'باز کردن تاریخچه',
    today: 'امروز',
    yesterday: 'دیروز',
    empty: 'هنوز جلسه‌ای ضبط نشده است.',
    settings: 'تنظیمات',
  },
  errors,
  errorActions: {
    retry: 'تلاش دوباره',
    switchToLocal: 'ادامه با موتور محلی',
  },
  notices,
} as const

export function providerName(id: string): string {
  return providers[id]?.name ?? id
}
