# Avanevis (working name)

Offline-first speech-to-text for Persian and English: live transcription, local Whisper, optional cloud engines and AI clean-up. Windows desktop (Tauri) and iPhone (PWA) from one codebase.

**[Open the web app](https://avanevis.netlify.app/)** · **[Download for Windows](https://github.com/Mahdii-Rastegar/speech-to-text/releases/latest)** · [توضیحات فارسی](#فارسی)

In the desktop app, speech is transcribed offline by a local Whisper engine (whisper.cpp, `large-v3-turbo`), sentence by sentence while the recording goes on; models are downloaded, checked and removed from inside the app. With the user's own key the desktop app can also transcribe through OpenRouter or Google's Gemini API, and clean up, summarize and title a transcript with a chat model; keys are kept in the Windows Credential Manager. The web app (installable on the iPhone as a PWA) has no local engine: it uses the same two cloud services straight from the browser, with the key kept encrypted in the browser's storage. The development server shows a scripted demo.

Audio is never stored. It leaves the device only when a cloud engine is chosen, and the transcript text only when the AI step is switched on. There is no account and no telemetry. [SECURITY.md](SECURITY.md) says where everything is kept and what the app does not protect against; [docs/performance.md](docs/performance.md) has the measured speed, accuracy and sizes.

On the development laptop's small NVIDIA card the local engine transcribes about nine times faster than speech and a sentence comes back in a second or two; without a graphics card it is slower than speech, and a cloud engine is the better choice for live text.

## Using it

The interface is in Persian.

- **Windows.** Download `Avanevis-…-windows-x64.zip` from the [latest release](https://github.com/Mahdii-Rastegar/speech-to-text/releases/latest), unpack it anywhere you may write to, and run `Avanevis.exe`. Nothing is installed. On first start, download a model under Settings (about 550 MB, once) to transcribe offline, or enter your own OpenRouter or Google AI Studio key to use a cloud engine. The executable is not code-signed, so Windows may ask before running it ("More info", then "Run anyway"). It needs 64-bit Windows 10 or 11 with the WebView2 runtime, which current Windows already has.
- **iPhone, or any browser.** Open [avanevis.netlify.app](https://avanevis.netlify.app/) and enter your own key under Settings. On the iPhone, open it in Safari and choose Share, then Add to Home Screen. Nothing is transcribed on the phone itself; the recording goes to the cloud service you chose.
- **Just looking.** `pnpm install` and `pnpm dev` show a scripted demo of the whole interface, with no key, model or engine.

The download runs the local engine on the CPU, which is slower than speech. On a computer with an NVIDIA card the engine is several times faster once the CUDA libraries are in its `engine` folder; `pnpm portable --gpu` assembles them (see "Portable folder").

Keys are yours: the app has no server of its own and nobody else's key is built in. Both cloud services may be unreachable from some networks; the app says so when a request is refused.

## Development

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:5173 (the microphone needs localhost or HTTPS)
pnpm typecheck
pnpm lint
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # end-to-end tests in the installed Microsoft Edge, with a generated
                  # sound file as the microphone
pnpm test:native  # unit tests of the Rust side (needs the desktop toolchain, see below)
pnpm build
```

The end-to-end tests run against the demo, except the `web-app` project, which builds the real web app and plays the cloud service itself.

`pnpm dev` shows the demo: scripted engines, no keys. `VITE_DEMO=0 pnpm dev` runs the real web app instead.

### Web app (PWA)

`pnpm build` writes the web app to `dist/`. It is a static site: host that folder on any HTTPS address (the microphone needs HTTPS), for example by connecting the repository to Netlify (`netlify.toml` holds the build settings) or by uploading `dist/` there by hand. `public/_headers` sets the response headers, including a Content-Security-Policy that lets the page talk only to itself, OpenRouter and Google's Gemini API. On the iPhone, open the address in Safari and choose Share, then Add to Home Screen.

### Desktop app (Windows)

```bash
pnpm tauri dev    # the app in a native window, with hot reload
pnpm tauri build  # optimised executable in src-tauri/target/release
```

This needs Rust (stable, `x86_64-pc-windows-msvc`), the MSVC C++ build tools with a Windows SDK, and the WebView2 runtime (part of Windows 11 and current Windows 10). If the build tools are not installed system-wide, the build scripts can use a self-contained toolchain folder; the comment at the top of `scripts/toolchain.mjs` explains how.

The local engine is not part of the repository. Development builds look for it in the project folder:

- `bench/tools/whisper-cpp/Release/` (or `engine/`): a Windows release of [whisper.cpp](https://github.com/ggml-org/whisper.cpp/releases) with `whisper-server.exe`
- `models/`: model files, which the app downloads itself (Settings, local models)

The CUDA build of whisper.cpp uses the graphics card only if it can load `cublas64_11.dll` and `cublasLt64_11.dll`. Put them beside the engine, or name their folder on the first line of a `cuda.local` file next to `package.json`. Without them the engine runs on the CPU, several times slower.

### Portable folder

```bash
pnpm portable          # builds the app and assembles portable/Avanevis
pnpm portable --gpu    # also assembles the optional GPU pack for NVIDIA cards
```

`portable/Avanevis` runs from wherever it is copied to and needs nothing installed besides the WebView2 runtime. It holds the app, the engine's CPU files and an empty `models` folder; the app creates `data` (History and settings) beside itself. The GPU pack is about a gigabyte of CUDA libraries, kept apart because it only helps on NVIDIA cards. The comment at the top of `scripts/portable.mjs` has the details.

`node scripts/screenshots.mjs` (with the dev server running) saves screenshots of the main states to `test-results/screens/`.

## Layout

```text
src/core      Pure TypeScript shared by desktop and PWA: session model, STT provider
              contract, recording state machine, AI step, formatting, audio math
              (resampling, voice activity detection)
src/app       Composition root, stores, recording controller
src/audio     Microphone capture (16 kHz mono) and the input level meter
src/ui        React components, design tokens, interface strings (Persian, RTL)
src/platform  What only one platform has: the desktop app's local engine and key
              store, the web app's key store and cloud requests
src-tauri     Windows desktop shell (Tauri 2, Rust); runs whisper.cpp's server as a
              child process on 127.0.0.1 and keeps the model loaded
tests/e2e     Playwright tests
```

The product name lives in `src/app/config.ts`.

## License

[MIT](LICENSE). The app runs [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and OpenAI's Whisper models (both MIT) and embeds the Vazirmatn and JetBrains Mono fonts (SIL Open Font License 1.1). Neither the engine nor the models are in this repository; the notices that go out with the portable folder are in `scripts/portable/licenses/`.

---

<div dir="rtl">

## فارسی

**آوانویس** (نام موقت) گفتار فارسی و انگلیسی را به متن تبدیل می‌کند. متن همان موقع که صحبت می‌کنید، جمله به جمله، روی صفحه می‌آید. برنامه یک نسخه‌ی ویندوز دارد و یک نسخه‌ی وب که روی آیفون مثل یک اپ نصب می‌شود. رابط برنامه فارسی و راست‌به‌چپ است.

**[باز کردن نسخه‌ی وب](https://avanevis.netlify.app/)** · **[دانلود برای ویندوز](https://github.com/Mahdii-Rastegar/speech-to-text/releases/latest)**

### چه کارهایی می‌کند

- **تبدیل آفلاین روی ویندوز:** موتور محلی Whisper روی کامپیوتر خودتان کار می‌کند و بعد از دانلود مدل به اینترنت نیاز ندارد.
- **موتور ابری با کلید خودتان:** اگر بخواهید، صدا با OpenRouter یا Google Gemini به متن تبدیل می‌شود.
- **پردازش با AI:** متن را پاک‌سازی و خلاصه می‌کند و برایش عنوان می‌گذارد. متن خام همیشه دست‌نخورده می‌ماند.
- **فایل صوتی:** به‌جای ضبط، می‌توانید یک فایل صوتی بدهید.
- **واژه‌نامه:** اسم‌ها و اصطلاحات انگلیسی پرکاربردتان را در تنظیمات بنویسید تا درست نوشته شوند.
- **تاریخچه:** متن جلسه‌ها ذخیره می‌شود و قابل جست‌وجو است.

### استفاده روی ویندوز

۱. از صفحه‌ی [آخرین نسخه](https://github.com/Mahdii-Rastegar/speech-to-text/releases/latest) فایل `Avanevis-…-windows-x64.zip` را دانلود کنید.

۲. آن را در پوشه‌ای که اجازه‌ی نوشتن دارید باز کنید (مثلاً Documents یا یک درایو دیگر، نه Program Files) و `Avanevis.exe` را اجرا کنید. نصب لازم ندارد.

۳. بار اول یکی از این دو کار را بکنید:

- برای کار آفلاین: در «تنظیمات»، بخش «مدل‌های موتور محلی»، مدل پیشنهادی را دانلود کنید (حدود ۵۵۰ مگابایت، فقط یک بار).
- برای موتور ابری: کلید OpenRouter یا Google AI Studio خودتان را در «تنظیمات»، بخش «کلید API»، وارد کنید.

چند نکته:

- فایل برنامه امضای دیجیتال ندارد و ویندوز ممکن است قبل از اجرا هشدار بدهد. در آن پنجره «More info» و بعد «Run anyway» را بزنید.
- ویندوز ۱۰ یا ۱۱ شصت‌وچهار بیتی لازم است.
- فایل دانلودی موتور محلی را روی CPU اجرا می‌کند که از سرعت صحبت کندتر است. با کارت گرافیک NVIDIA موتور چند برابر سریع‌تر می‌شود، ولی فایل‌های لازمش (حدود یک گیگابایت) در این دانلود نیست و باید از روی کد ساخته شود (`pnpm portable --gpu`). بدون کارت NVIDIA، برای متن زنده موتور ابری مناسب‌تر است.

### استفاده روی آیفون یا مرورگر

نشانی [avanevis.netlify.app](https://avanevis.netlify.app/) را باز کنید و کلید خودتان را در تنظیمات وارد کنید. روی آیفون، سایت را در Safari باز کنید و از منوی Share گزینه‌ی «Add to Home Screen» را بزنید تا مثل یک اپ نصب شود.

روی گوشی موتور محلی وجود ندارد و صدا برای سرویس ابری‌ای که انتخاب کرده‌اید فرستاده می‌شود. برای گوشی بهتر است یک کلید جدا با سقف اعتبار کم بسازید.

هر دو سرویس ابری ممکن است از بعضی شبکه‌ها در دسترس نباشند. در این حالت برنامه همین را می‌گوید.

### حریم خصوصی

- صدا هیچ‌وقت ذخیره نمی‌شود.
- صدا فقط وقتی از دستگاه بیرون می‌رود که موتور ابری را انتخاب کرده باشید، و متن فقط وقتی که پردازش با AI روشن باشد.
- برنامه حساب کاربری، آمارگیری و سرور ندارد. کلید هیچ‌کس داخل برنامه نیست و هر کس کلید خودش را وارد می‌کند.
- روی ویندوز کلید در Credential Manager نگه داشته می‌شود، نه در پوشه‌ی برنامه. در مرورگر به‌صورت رمزشده در حافظه‌ی همان مرورگر می‌ماند.

جزئیات، و چیزهایی که برنامه از آن‌ها محافظت نمی‌کند، در [SECURITY.md](SECURITY.md) آمده است (انگلیسی).

### سرعت

روی لپ‌تاپی که برنامه با آن ساخته شد، با یک کارت گرافیک قدیمی و کوچک NVIDIA، موتور محلی حدود ۹ برابر سریع‌تر از صحبت کار می‌کند و هر جمله در یکی دو ثانیه برمی‌گردد. بدون کارت گرافیک، همان موتور از سرعت صحبت کندتر است. اعداد کامل در [docs/performance.md](docs/performance.md) است (انگلیسی).

### برای برنامه‌نویس‌ها

راهنمای ساخت و توسعه در بخش‌های انگلیسی بالا آمده است: «Development»، «Desktop app»، «Portable folder» و «Layout».

### مجوز (MIT License)

این پروژه با مجوز [MIT](LICENSE) منتشر شده است. به زبان ساده:

- هر کسی می‌تواند کد را رایگان استفاده، کپی، تغییر و منتشر کند، حتی در کار تجاری.
- تنها شرط این است که متن مجوز و نام صاحب اثر در نسخه‌هایی که پخش می‌شود باقی بماند.
- برنامه «همان‌طور که هست» ارائه می‌شود، بدون هیچ ضمانتی، و سازنده مسئول خسارت ناشی از استفاده‌ی آن نیست.

این توضیح فقط خلاصه است و ترجمه‌ی رسمی نیست. متن معتبر همان متن انگلیسی فایل [LICENSE](LICENSE) است.

موتور [whisper.cpp](https://github.com/ggml-org/whisper.cpp) و مدل‌های Whisper هم مجوز MIT دارند، و فونت‌های Vazirmatn و JetBrains Mono با مجوز SIL Open Font License 1.1 منتشر شده‌اند.

</div>
