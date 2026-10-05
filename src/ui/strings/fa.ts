import type { NoticeKind } from '@/app/stores/uiStore'
import type { CloudProviderId } from '@/core/cloud/transport'
import type { AppErrorKind } from '@/core/errors'
import type { EngineOutlook, ModelFailureKind } from '@/core/models/localModels'
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
  'recording-started-slow':
    'ضبط شروع شد. موتور محلی روی پردازنده کار می‌کند؛ متن هر جمله با تأخیر زیاد می‌آید.',
  'recording-stopped': 'ضبط تمام شد و متن ذخیره شد',
  'nothing-recorded': 'چیزی ضبط نشد',
  copied: 'کپی شد',
  'copy-failed': 'کپی انجام نشد. متن را انتخاب و دستی کپی کنید.',
  'ai-finished': 'پردازش AI تمام شد',
  'ai-failed': 'پردازش AI انجام نشد. متن خام دست‌نخورده است.',
  'file-finished': 'متن فایل آماده و ذخیره شد',
  'file-no-speech': 'در این فایل صحبتی پیدا نشد',
  'file-cancelled': 'تبدیل فایل لغو شد',
  'history-unavailable': 'تاریخچه در دسترس نیست؛ جلسه‌ها فقط تا بسته شدن برنامه می‌مانند.',
  'session-deleted': 'جلسه حذف شد',
  'history-cleared': 'تاریخچه پاک شد',
  'key-not-saved': 'در نسخه‌ی نمایشی کلید ذخیره نمی‌شود',
  'key-saved': 'کلید ذخیره شد',
  'key-save-failed': 'کلید ذخیره نشد. فقط خود کلید را، بدون فاصله، وارد کنید.',
  'key-deleted': 'کلید حذف شد',
  'model-installed': 'مدل دانلود شد و آماده است',
  'model-deleted': 'مدل حذف شد',
  'model-delete-failed': 'مدل حذف نشد. اگر ضبطی در جریان است، بعد از پایانش دوباره تلاش کنید.',
  'mic-no-signal': 'از این میکروفون صدایی نمی‌رسد. در تنظیمات میکروفون دیگری انتخاب کنید.',
  'mic-fell-back': 'میکروفون انتخاب‌شده پیدا نشد؛ ضبط با میکروفون پیش‌فرض سیستم شروع شد.',
}

/** Longer forms for notices that can say what went wrong. */
const noticesWithReason: Partial<Record<NoticeKind, string>> = {
  'ai-failed': 'پردازش AI انجام نشد: {reason}',
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
  'missing-api-key': {
    title: 'کلید API وارد نشده است',
    body: 'کلید این سرویس را در تنظیمات وارد کنید.',
  },
  'invalid-api-key': {
    title: 'کلید API پذیرفته نشد',
    body: 'کلید را در تنظیمات بررسی کنید.',
  },
  'no-credit': {
    title: 'اعتبار حساب این سرویس کافی نیست',
    body: 'حساب خود را در سایت سرویس شارژ کنید، یا با موتور محلی ادامه دهید.',
  },
  'rate-limited': {
    title: 'سقف استفاده از سرویس پر شده است',
    body: 'کمی بعد دوباره تلاش کنید، یا با موتور محلی ادامه دهید.',
  },
  'model-unavailable': {
    title: 'مدل انتخاب‌شده در دسترس نیست',
    body: 'مدل دیگری را در تنظیمات انتخاب کنید.',
  },
  'local-engine-missing': {
    title: 'موتور محلی پیدا نشد',
    body: 'پوشه‌ی engine باید کنار فایل برنامه باشد. برنامه را دوباره از بسته‌ی اصلی‌اش باز کنید.',
  },
  'local-model-missing': {
    title: 'مدل موتور محلی هنوز دانلود نشده است',
    body: 'مدل را در تنظیمات، بخش «مدل‌های موتور محلی»، دانلود کنید. بعد از آن اینترنت لازم نیست.',
  },
  'file-unreadable': {
    title: 'این فایل خوانده نشد',
    body: 'فایل صوتی نیست، قالبش پشتیبانی نمی‌شود یا خراب است. قالب‌های MP3، WAV، M4A، OGG و FLAC را امتحان کنید.',
  },
  'file-too-large': {
    title: 'فایل خیلی بزرگ است',
    body: 'فایل‌های تا ۳۰۰ مگابایت پذیرفته می‌شوند. فایل را به چند بخش کوتاه‌تر تقسیم کنید.',
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

/** The same failures where there is no local engine to fall back on (the web app). */
const errorBodiesWithoutLocal: Partial<Record<AppErrorKind, string>> = {
  'live-unsupported': 'موتور دیگری انتخاب کنید.',
  'provider-blocked':
    'VPN را روشن کنید و دوباره تلاش کنید. اگر VPN روشن است، سرویس دیگر را در تنظیمات امتحان کنید.',
  'no-credit': 'حساب خود را در سایت سرویس شارژ کنید، یا سرویس دیگر را در تنظیمات انتخاب کنید.',
  'rate-limited': 'کمی بعد دوباره تلاش کنید، یا سرویس دیگر را در تنظیمات انتخاب کنید.',
  offline: 'این نسخه برای تبدیل گفتار به اینترنت نیاز دارد. اتصال را بررسی کنید.',
  timeout: 'دوباره تلاش کنید.',
}

/** Display names for engines. Unknown ids fall back to the id itself. */
const providers: Record<string, { name: string; hint?: string }> = {
  'local-whisper': { name: 'Whisper محلی', hint: 'روی همین کامپیوتر، بدون اینترنت' },
  'demo-local': { name: 'Whisper محلی' },
  'demo-cloud': { name: 'OpenRouter' },
  'demo-failing': { name: 'سرویس ناموجود', hint: 'برای دیدن حالت خطا' },
  openrouter: { name: 'OpenRouter', hint: 'ابری، با کلید OpenRouter' },
  google: { name: 'Google Gemini', hint: 'ابری، با کلید Google AI Studio' },
}

/** What each local model is good for. Unknown ids show only their id. */
const localModels: Record<string, { title: string; body: string }> = {
  'large-v3-turbo': {
    title: 'Whisper large-v3-turbo',
    body: 'دقیق برای فارسی، انگلیسی و ترکیب هر دو. با کارت گرافیک NVIDIA سریع است.',
  },
  small: {
    title: 'Whisper small',
    body: 'سبک و کم‌حجم. برای انگلیسی خوب است، ولی در فارسی خطای زیادی دارد.',
  },
}

const engineOutlooks: Record<EngineOutlook, string> = {
  gpu: 'این کامپیوتر کارت گرافیک NVIDIA دارد و موتور محلی روی آن اجرا می‌شود.',
  'gpu-pack-missing':
    'کارت گرافیک NVIDIA پیدا شد، ولی بسته‌ی GPU کنار برنامه نیست؛ موتور محلی روی پردازنده اجرا می‌شود و هر جمله حدود نیم تا یک دقیقه طول می‌کشد. برنامه را ببندید و فایل‌های بسته‌ی GPU را در پوشه‌ی engine کپی کنید تا چند ثانیه شود.',
  cpu: 'این کامپیوتر کارت گرافیک NVIDIA ندارد؛ موتور محلی روی پردازنده اجرا می‌شود و متن با تأخیر می‌آید. هر جمله حدود نیم تا یک دقیقه طول می‌کشد. برای متن زنده، موتور ابری بهتر جواب می‌دهد.',
}

const modelFailures: Record<ModelFailureKind, string> = {
  offline: 'اتصال اینترنت برقرار نیست. بعد از وصل شدن، دانلود را ادامه دهید.',
  timeout: 'اتصال قطع شد. دانلود را ادامه دهید؛ از همان‌جا پی گرفته می‌شود.',
  blocked: 'سرور دانلود از این شبکه در دسترس نیست. با VPN دوباره تلاش کنید.',
  corrupt: 'فایل دانلودشده سالم نبود و پاک شد. دوباره دانلود کنید.',
  disk: 'نوشتن روی دیسک انجام نشد. فضای خالی و اجازه‌ی نوشتن در پوشه‌ی برنامه را بررسی کنید.',
  failed: 'دانلود انجام نشد. دوباره تلاش کنید.',
}

const cloudProviders: Record<CloudProviderId, { name: string; keyLabel: string; hint: string }> = {
  openrouter: {
    name: 'OpenRouter',
    keyLabel: 'کلید OpenRouter',
    hint: 'هزینه‌ی واقعی هر درخواست را گزارش می‌کند.',
  },
  google: {
    name: 'Google Gemini',
    keyLabel: 'کلید Google AI Studio',
    hint: 'با کلید Google AI Studio؛ هزینه فقط برای بعضی مدل‌ها تخمین زده می‌شود.',
  },
}

export const fa = {
  demo: {
    badge: 'نمایشی',
    note: 'نسخه‌ی نمایشی: میکروفون واقعی است، ولی متن‌ها هنوز نمونه‌اند. صدا ذخیره یا ارسال نمی‌شود.',
    localNote:
      'موتور محلی: متن روی همین دستگاه و بدون اینترنت ساخته می‌شود. صدا ذخیره یا ارسال نمی‌شود.',
    cloudNote:
      'موتور ابری: صدا برای تبدیل به سرویس انتخاب‌شده فرستاده می‌شود و در برنامه ذخیره نمی‌شود.',
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
    noSignalHint:
      'از میکروفون هیچ صدایی نمی‌آید. بی‌صدا نبودن آن را بررسی کنید یا در تنظیمات میکروفون دیگری انتخاب کنید.',
    upload: 'آپلود فایل صوتی',
    uploadLocked: 'هنگام ضبط نمی‌شود فایل فرستاد',
    readingFile: 'در حال خواندن فایل…',
    transcribingFile: 'در حال تبدیل فایل',
    fileProgress: 'پیشرفت تبدیل فایل',
    cancelFile: 'لغو تبدیل فایل',
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
    fromFile: 'از فایل',
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
  cloudProviders,
  localModels,
  engineOutlooks,
  modelFailures,
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
    sttModelTitle: 'مدل',
    sttModelHint: 'هزینه و دقت مدل‌ها فرق دارد؛ هزینه‌ی هر جلسه کنار متن آن نوشته می‌شود.',
    sttKeyMissing: 'برای این سرویس هنوز کلیدی ذخیره نشده است. آن را در بخش «کلید API» وارد کنید.',
    languageAutoHint:
      'در حالت خودکار، موتور محلی اول زبان را تشخیص می‌دهد و هر جمله تقریباً دو برابر طول می‌کشد. اگر بیشتر فارسی صحبت می‌کنید، «فارسی» را انتخاب کنید؛ کلمه‌های انگلیسی وسط جمله معمولاً همچنان به انگلیسی نوشته می‌شوند.',
    modelsSection: 'مدل‌های موتور محلی',
    modelsHint:
      'مدل یک بار دانلود می‌شود و بعد از آن بدون اینترنت کار می‌کند. دانلودی که متوقف شود، بار بعد از همان‌جا ادامه پیدا می‌کند.',
    modelRecommended: 'پیشنهادی',
    modelInstalled: 'آماده',
    modelInUse: 'در حال استفاده',
    modelUse: 'استفاده',
    modelMissing: 'دانلود نشده',
    modelPartial: 'دانلود نیمه‌کاره',
    modelVerifying: 'در حال بررسی فایل…',
    modelDownload: 'دانلود',
    modelResume: 'ادامه‌ی دانلود',
    modelStop: 'توقف',
    modelDelete: 'حذف',
    /** Accessible names: the visible words are the same for every model. */
    modelActionFor: '{action} {model}',
    modelProgress: 'پیشرفت دانلود {model}',
    megabytes: '{size} مگابایت',
    megabytesOf: '{done} از {size} مگابایت',
    confirmModelDeleteTitle: 'این مدل حذف شود؟',
    confirmModelDeleteBody:
      'فایل مدل از روی دیسک پاک می‌شود. برای استفاده‌ی دوباره باید آن را از نو دانلود کنید.',
    microphoneSection: 'میکروفون',
    microphoneDefault: 'پیش‌فرض سیستم',
    microphoneDefaultHint: 'همان ورودی‌ای که در تنظیمات صدای سیستم انتخاب شده است.',
    microphoneHint: 'اگر هنگام ضبط «صدایی نمی‌رسد» می‌بینید، میکروفون دیگری را امتحان کنید.',
    microphoneUnnamed: 'میکروفون {number}',
    microphoneShowList: 'نمایش فهرست میکروفون‌ها',
    microphoneNeedsAccess:
      'برای دیدن نام میکروفون‌ها، برنامه یک بار اجازه‌ی دسترسی به میکروفون می‌خواهد. چیزی ضبط نمی‌شود.',
    microphoneAccessDenied: 'اجازه‌ی میکروفون داده نشد، برای همین فهرست قابل نمایش نیست.',
    glossarySection: 'واژه‌نامه‌ی شخصی',
    glossaryLabel: 'اسم‌ها و اصطلاح‌هایی که زیاد می‌گویید',
    glossaryHint:
      'با ویرگول جدا کنید. موتور این کلمه‌ها را درست‌تر می‌نویسد، مخصوصاً اصطلاح‌های انگلیسی وسط جمله‌ی فارسی. بعضی مدل‌های ابری آن را نادیده می‌گیرند.',
    glossaryPlaceholder: 'API, Deploy, prompt, backend',
    aiSection: 'پردازش با AI',
    aiMasterHint:
      'بعد از پایان هر ضبط، متن خودکار پردازش می‌شود. متن خام همیشه دست‌نخورده می‌ماند.',
    aiCleanHint: 'اصلاح نگارش و نقطه‌گذاری، بدون تغییر معنی و لحن.',
    aiSummaryHint: 'یک خلاصه‌ی کوتاه از متن.',
    aiProviderTitle: 'سرویس AI',
    aiPrivacy: 'هنگام پردازش، متن جلسه (نه صدا) برای سرویس انتخاب‌شده فرستاده می‌شود.',
    aiKeyMissing: 'برای این سرویس هنوز کلیدی ذخیره نشده است. آن را در بخش «کلید API» وارد کنید.',
    aiModelLabel: 'مدل',
    aiModelHint:
      'شناسه‌ی مدل را همان‌طور که در سایت سرویس نوشته شده وارد کنید. اگر خالی بماند، مدل پیش‌فرض استفاده می‌شود.',
    keySection: 'کلید API',
    keyHint:
      'کلید در Credential Manager ویندوز نگه داشته می‌شود، نه در فایل‌های برنامه، و فقط برای خود همان سرویس فرستاده می‌شود. بعد از ذخیره دیگر نمایش داده نمی‌شود.',
    keyHintDemo:
      'کلید فقط روی همین دستگاه نگه داشته می‌شود و جز برای خود سرویس به جایی فرستاده نمی‌شود. در نسخه‌ی نمایشی ذخیره نمی‌شود.',
    keyHintWeb:
      'کلید به‌صورت رمزشده در حافظه‌ی همین مرورگر می‌ماند و فقط برای خود همان سرویس فرستاده می‌شود. مرورگر به امنی برنامه‌ی ویندوز نیست؛ برای گوشی کلیدی جدا با سقف اعتبار کم بسازید.',
    keyNone: 'کلیدی ذخیره نشده است.',
    keyStored: 'کلید ذخیره شده است.',
    keyReplace: 'برای جایگزینی، کلید تازه را وارد کنید',
    keyChecking: 'در حال بررسی کلید…',
    keyValid: 'سرویس این کلید را پذیرفت.',
    keyCheckFailed: 'بررسی کلید ناموفق بود: {reason}',
    keyCheck: 'بررسی',
    keyDelete: 'حذف',
    keySave: 'ذخیره',
    /** Accessible names: the visible words are the same for every service. */
    keyActionFor: '{action} {key}',
    keyShow: 'نمایش',
    keyHide: 'پنهان کردن',
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
    pointsWeb: [
      {
        title: 'متن زنده',
        body: 'جمله‌به‌جمله، هم‌زمان با صحبت شما نوشته می‌شود؛ فارسی، انگلیسی یا ترکیب هر دو.',
      },
      {
        title: 'با کلید خودتان',
        body: 'صدا با OpenRouter یا Google Gemini متن می‌شود. کلید را یک بار در تنظیمات وارد کنید.',
      },
      {
        title: 'پاک‌سازی و خلاصه با AI',
        body: 'اگر بخواهید، متن بعد از ضبط مرتب و خلاصه می‌شود. متن خام دست‌نخورده می‌ماند.',
      },
    ],
    languageQuestion: 'بیشتر به چه زبانی صحبت می‌کنید؟',
    languageHint: 'بعداً از تنظیمات قابل تغییر است.',
    start: 'شروع کنید',
  },
  errors,
  errorBodiesWithoutLocal,
  errorActions: {
    retry: 'تلاش دوباره',
    switchToLocal: 'ادامه با موتور محلی',
    openSettings: 'باز کردن تنظیمات',
    details: 'جزئیات فنی',
  },
  notices,
  noticesWithReason,
} as const

export function providerName(id: string): string {
  return providers[id]?.name ?? id
}
