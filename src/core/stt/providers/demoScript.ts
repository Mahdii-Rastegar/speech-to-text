/**
 * Scripted content for the demo engine: Persian speech with English technical
 * terms, written the way a raw transcript looks (false starts, fillers, loose
 * punctuation) next to its cleaned counterpart.
 */
export interface DemoLine {
  raw: string
  clean: string
  /** One-phrase gist used to build the demo summary. */
  gist: string
}

export const DEMO_SCRIPT: readonly DemoLine[] = [
  {
    raw: 'امروز باید روی AI Agent پروژه کار کنم و بعد، بعد API رو تست کنم',
    clean: 'امروز باید روی AI Agent پروژه کار کنم و بعد API رو تست کنم.',
    gist: 'کار روی AI Agent و تست API',
  },
  {
    raw: 'اول می‌خوام ببینم مدل large-v3 روی GPU خودم چقدر سریع جواب می‌ده',
    clean: 'اول می‌خوام ببینم مدل large-v3 روی GPU خودم چقدر سریع جواب می‌ده.',
    gist: 'سنجش سرعت large-v3 روی GPU',
  },
  {
    raw: 'اگه تأخیرش زیر دو ثانیه باشه همینو برای حالت live نگه می‌داریم',
    clean: 'اگه تأخیرش زیر دو ثانیه باشه، همین رو برای حالت live نگه می‌داریم.',
    gist: 'نگه داشتن همین مدل برای live اگر تأخیر زیر دو ثانیه باشد',
  },
  {
    raw: 'بعدش باید یعنی History رو درست کنم که هر جلسه با تاریخ و مدت زمانش ذخیره بشه',
    clean: 'بعدش باید History رو درست کنم که هر جلسه با تاریخ و مدت‌زمانش ذخیره بشه.',
    gist: 'ساخت History با تاریخ و مدت هر جلسه',
  },
  {
    raw: 'آخر هفته هم یه نسخه portable می‌سازم و روی لپ تاپ دوم تستش می‌کنم',
    clean: 'آخر هفته هم یه نسخه‌ی portable می‌سازم و روی لپ‌تاپ دوم تستش می‌کنم.',
    gist: 'ساخت و تست نسخه‌ی portable در آخر هفته',
  },
  {
    raw: 'یادم باشه قبل از commit کلیدهای API رو از فایل‌ها پاک کنم',
    clean: 'یادم باشه قبل از commit کلیدهای API رو از فایل‌ها پاک کنم.',
    gist: 'پاک کردن کلیدهای API قبل از commit',
  },
]

export const DEMO_TITLE = 'برنامه‌ی کار روی AI Agent'
