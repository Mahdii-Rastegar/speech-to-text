# Avanevis (working name)

Offline-first speech-to-text for Persian and English: live transcription, local Whisper, optional cloud engines and AI clean-up. Windows desktop (Tauri) and iPhone (PWA) from one codebase.

**Status: feature-complete, in final testing.** In the desktop app, speech is transcribed offline by a local Whisper engine (whisper.cpp, `large-v3-turbo`), sentence by sentence while the recording goes on; models are downloaded, checked and removed from inside the app. With the user's own key the desktop app can also transcribe through OpenRouter or Google's Gemini API, and clean up, summarize and title a transcript with a chat model; keys are kept in the Windows Credential Manager. The web app (installable on the iPhone as a PWA) has no local engine: it uses the same two cloud services straight from the browser, with the key kept encrypted in the browser's storage. The development server shows a scripted demo.

Audio is never stored. It leaves the device only when a cloud engine is chosen, and the transcript text only when the AI step is switched on. There is no account and no telemetry. [SECURITY.md](SECURITY.md) says where everything is kept and what the app does not protect against; [docs/performance.md](docs/performance.md) has the measured speed, accuracy and sizes.

On the development laptop's small NVIDIA card the local engine transcribes about nine times faster than speech and a sentence comes back in a second or two; without a graphics card it is slower than speech, and a cloud engine is the better choice for live text.

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
