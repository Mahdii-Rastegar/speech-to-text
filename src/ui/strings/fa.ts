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
  'session-deleted': 'جلسه حذف شد',
  'history-cleared': 'تاریخچه پاک شد',
  'key-not-saved': 'در نسخه‌ی نمایشی کلید ذخیره نمی‌شود',
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
  'mic-busy': {
    title: 'میکروفون در دسترس نیست',
    body: 'شاید برنامه‌ی دیگری از میکروفون استفاده می‌کند. آن را ببندید و دوباره تلاش کنید.',
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
    note: 'نسخه‌ی نمایشی: میکروفون واقعی است، ولی متن‌ها هنوز نمونه‌اند. صدا ذخیره یا ارسال نمی‌شود.',
  },
  recorder: {
    region: 'ضبط',
    start: 'شروع ضبط',
    stop: 'پایان ضبط',
    starting: 'در حال آماده‌سازی…',
    recording: 'در حال ضبط',
    finalizing: 'در حال نهایی‌سازی متن…',
    elapsed: 'زمان سپری‌شده',
    speech: 'صحبت',
    silence: 'سکوت',
    noSignal: 'صدایی نمی‌رسد',
    noSignalHint: 'از میکروفون هیچ صدایی نمی‌آید. بی‌صدا نبودن آن را بررسی کنید.',
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
    openSearch: 'جست‌وجو در تاریخچه',
    searchPlaceholder: 'جست‌وجو در عنوان و متن جلسه‌ها',
    clearSearch: 'پاک کردن جست‌وجو',
    sessionsUnit: 'جلسه',
    resultsUnit: 'نتیجه',
    noResults: 'چیزی با این جست‌وجو پیدا نشد.',
    copySession: 'کپی متن جلسه',
    deleteSession: 'حذف جلسه',
    deleteAll: 'حذف همه',
    confirmDeleteTitle: 'این جلسه حذف شود؟',
    confirmDeleteBody: 'متن خام، نسخه‌ی پاک‌شده و خلاصه‌ی این جلسه برای همیشه پاک می‌شود.',
    confirmClearTitle: 'همه‌ی تاریخچه پاک شود؟',
    confirmClearBody: 'متن همه‌ی جلسه‌ها برای همیشه پاک می‌شود و قابل برگشت نیست.',
    confirmDelete: 'حذف',
    confirmClear: 'پاک کردن همه',
  },
  nav: {
    back: 'بازگشت به صفحه‌ی اصلی',
    backToRecording: 'بازگشت به ضبط',
    cancel: 'انصراف',
  },
  settings: {
    title: 'تنظیمات',
    engineSection: 'موتور و زبان',
    aiSection: 'پردازش با AI',
    aiMasterHint:
      'بعد از پایان هر ضبط، متن خودکار پردازش می‌شود. متن خام همیشه دست‌نخورده می‌ماند.',
    aiCleanHint: 'اصلاح نگارش و نقطه‌گذاری، بدون تغییر معنی و لحن.',
    aiSummaryHint: 'یک خلاصه‌ی کوتاه از متن.',
    keySection: 'کلید API',
    keyLabel: 'کلید OpenRouter',
    keyHint:
      'کلید فقط روی همین دستگاه نگه داشته می‌شود و جز برای خود سرویس به جایی فرستاده نمی‌شود. در نسخه‌ی نمایشی ذخیره نمی‌شود.',
    keyNone: 'کلیدی ذخیره نشده است.',
    keySave: 'ذخیره',
    keyShow: 'نمایش کلید',
    keyHide: 'پنهان کردن کلید',
    dataSection: 'داده‌ها و حریم خصوصی',
    dataNote: 'صدا هیچ‌وقت ذخیره نمی‌شود. فقط متن جلسه‌ها و مشخصاتشان روی همین دستگاه می‌ماند.',
    clearHistory: 'پاک کردن تاریخچه',
    demoSection: 'ابزار نسخه‌ی نمایشی',
    demoNote: 'این بخش فقط برای بازبینی ظاهر برنامه است و در نسخه‌ی نهایی نخواهد بود.',
    errorPreview: 'پیش‌نمایش پیام‌های خطا',
    errorPreviewHint: 'روی هر مورد بزنید تا پیامش در صفحه‌ی اصلی نمایش داده شود.',
    showWelcome: 'دیدن دوباره‌ی صفحه‌ی خوش‌آمد',
  },
  welcome: {
    lead: 'به {name} خوش آمدید',
    points: [
      {
        title: 'متن زنده',
        body: 'هم‌زمان با صحبت شما نوشته می‌شود؛ فارسی، انگلیسی یا ترکیب هر دو.',
      },
      {
        title: 'محلی و آفلاین',
        body: 'با موتور محلی، صدا روی همین دستگاه می‌ماند و اینترنت لازم نیست.',
      },
      {
        title: 'ابری و AI، به انتخاب شما',
        body: 'با کلید خودتان می‌توانید از موتور ابری، پاک‌سازی و خلاصه‌ی AI استفاده کنید.',
      },
    ],
    languageQuestion: 'بیشتر به چه زبانی صحبت می‌کنید؟',
    languageHint: 'بعداً از تنظیمات قابل تغییر است.',
    start: 'شروع کنید',
  },
  errors,
  errorActions: {
    retry: 'تلاش دوباره',
    switchToLocal: 'ادامه با موتور محلی',
    openSettings: 'باز کردن تنظیمات',
  },
  notices,
} as const

export function providerName(id: string): string {
  return providers[id]?.name ?? id
}
