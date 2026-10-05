# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Avanevis (working name, `APP_NAME` in `src/app/config.ts`): offline-first speech-to-text for Persian and English. One React codebase serves a Windows desktop app (Tauri 2) and a web app installed on the iPhone as a PWA. The interface is Persian and right-to-left. The project is built in small phases; the development server shows a scripted demo (see "Real versus demo").

## Commands

Node 22+ and pnpm 10.

```bash
pnpm dev                 # Vite on http://localhost:5173 (port is fixed, strictPort)
pnpm typecheck           # tsc -b
pnpm lint                # oxlint
pnpm format              # prettier --write .
pnpm test                # Vitest, src/**/*.test.ts, node environment
pnpm test:e2e            # Playwright in the installed Microsoft Edge
pnpm build               # tsc -b && vite build; `dist/` is the web app (PWA) as it is hosted
pnpm tauri dev           # desktop app in a native window, hot reload
pnpm tauri build         # release executable in src-tauri/target/release
pnpm portable            # release build + the portable folder in portable/ (see scripts/portable.mjs)
```

Single tests:

```bash
pnpm vitest run src/core/recording/machine.test.ts
pnpm vitest run -t "name of the test"
pnpm playwright test tests/e2e/recording.spec.ts --project=desktop   # or --project=mobile
pnpm playwright test -g "title of the test"
```

`pnpm exec vite preview` serves the built web app (the real one, not the demo) on port 4173. `node scripts/icons.mjs` redraws the PWA icons in `public/icons` from `public/favicon.svg`.

`node scripts/screenshots.mjs` (dev server running) saves every screen in its key states to `test-results/screens/` for visual review after UI changes.

`python bench/benchmark.py` compares local engines on recordings in `bench/samples` (git-ignored); it is a research script, not part of the app.

### Native build

Always go through `pnpm tauri ...` (`scripts/tauri.mjs`), never call `cargo` or the Tauri CLI directly: Rust and MSVC may live in a self-contained folder that is not on PATH. The script reads that folder from `STT_TOOLCHAIN_DIR` or the first line of the git-ignored `toolchain.local`, and builds the environment (`CARGO_HOME`, `INCLUDE`, `LIB`, `PATH`) for the child process only. The same goes for `cuda.local` / `STT_CUDA_DLL_DIR` (folder holding `cublas64_11.dll` and `cublasLt64_11.dll`); without them the engine silently runs on the CPU, several times slower.

The Rust modules (`engine.rs`, `models.rs`, `history.rs`, `audio.rs`, `cloud.rs`, `secrets.rs`) have unit tests, but there is no package script for them; running `cargo test` needs the same toolchain environment the script sets up.

Development builds find the engine and model by walking up from the executable: `bench/tools/whisper-cpp/Release/whisper-server.exe` (or `engine/`) and `models/ggml/ggml-large-v3-turbo-q5_0.bin` (or `models/`). Overrides: `STT_ENGINE_DIR`, `STT_MODELS_DIR`. Neither is in the repository. The History database is `data/history.sqlite3` beside the executable, and the web view keeps its own files (the localStorage settings among them) in `data/webview`; development builds use the project's git-ignored `data/` instead (`STT_DATA_DIR` overrides both).

### Portable folder

`scripts/portable.mjs` builds the release executable with the C runtime linked in (`RUSTFLAGS=-C target-feature=+crt-static`, set for that build only) and assembles `portable/Avanevis/`: the executable, `engine/` with whisper.cpp's CPU files and the Microsoft runtime libraries they import, an empty `models/`, and the README and notices kept in `scripts/portable/`. Running it again updates the folder in place and never removes `data/`, `models/` or GPU files already in `engine/`. `--gpu` also assembles `portable/Avanevis-gpu-pack/` (`ggml-cuda.dll` and the CUDA libraries, about a gigabyte), whose files are copied into `engine/` by hand; without them the same engine runs on the CPU. `--with-model` copies the recommended model in. Everything under `portable/` is git-ignored. A release build looks for `engine/`, `models/` and `data/` only beside the executable.

## Architecture

Layers, with imports pointing downward only:

- `src/core`: pure TypeScript with no DOM, React or Tauri imports, and relative imports only. Everything unit-tested lives here. Session model, the STT provider contract, the recording state machine, audio math (resampling, VAD, PCM), formatting.
- `src/audio`: browser microphone capture through an AudioWorklet, resampled to 16 kHz mono Float32 (`CAPTURE_SAMPLE_RATE`). Every engine is fed this format.
- `src/platform/tauri`: the only place that imports `@tauri-apps/api`. `src/platform/web` holds the browser counterparts (IndexedDB History, the cloud transport and key store of the web app, the service worker registration).
- `src/app`: composition root (`services.ts`), zustand stores, and `recordingController.ts`.
- `src/ui`: React components. All interface text is in `src/ui/strings/fa.ts`; components never hold literal Persian strings.

Path alias `@/` is `src/` (used everywhere except inside `src/core`).

### Recording flow

`recordingController.ts` is the only orchestrator. Components call its functions (`startRecording`, `stopRecording`, `processSession`, ...) and read stores; they do not talk to providers or the microphone.

1. `startRecording` must run inside the click handler: it requests the microphone and validates the provider in parallel so the browser's user-gesture permission is not lost.
2. Captured blocks go to an input monitor (level meter, VAD, "no signal" notice) and to a `LiveSession`.
3. The `LiveSession` comes from `provider.transcribeStream?.()` or, for batch engines, from `createChunkedLiveSession` (`src/core/stt/chunkedLive.ts`), which cuts the recording at the speaker's pauses and sends each piece as it ends, one request at a time, so finals arrive sentence by sentence. For engines that are free to run it also re-transcribes the sentence in progress to show interim text. It never sends a piece in which the VAD heard no voice, because Whisper invents text from silence. The local engine goes over a full 30-second window per request whatever the clip length, and once more when the language is `auto` (it detects the language first), which is what bounds the live delay: a few seconds on the development GPU, half a minute to a minute on its CPU. Interim text is therefore left out when the engine runs on the CPU (`runsOnProcessor`). Lowering whisper's `audio_ctx` to speed up short clips was tried and ruins the output.
4. All state changes go through `dispatchRecording(event)` into the pure reducer in `src/core/recording/machine.ts` (`idle → starting → recording → finalizing → done | error`). The reducer ignores events that do not fit the current phase, which is what makes late engine callbacks harmless; keep new transitions in the reducer rather than setting store state directly.
5. An uploaded file takes the same path without the microphone (`transcribeFile`): `decodeFile` turns it into 16 kHz mono, `transcribeRecording` (`src/core/stt/fileTranscription.ts`) cuts it at pauses into pieces of at most 25 seconds and sends them one by one, and the reducer goes `starting → finalizing` with `source: 'file'` and a `progress` value. The web view decodes the file; the desktop app falls back to the native `audio_decode` command for what the web view cannot read (Apple Lossless, which iPhone voice memos may use).
6. On stop, a `TranscriptionSession` is stored and the optional AI step (`processSession`) fills `cleanTranscript`, `summary`, `title`. `rawTranscript` is never rewritten.

### History

`sessionsStore` is the in-memory list the interface reads; every change is written through to a `HistoryRepository` (`src/core/history/repository.ts`) chosen in `services.ts`: SQLite on the desktop (`src/platform/tauri/history.ts` ↔ `src-tauri/src/history.rs`), IndexedDB in the browser. A session is stored as one JSON document, so the native side knows only its id and date; `parseStoredSession` validates each entry on the way back in and is where new session fields get their default. Search runs in memory (`src/core/text/search.ts`). Audio is never stored.

### STT providers

Every engine implements `STTProvider` (`src/core/stt/provider.ts`) and is registered in `src/app/services.ts`, the single place that decides which engines exist on which platform. Adding an engine means a new provider plus one `register` call; the recording flow does not change.

Failures are `AppError` values (`src/core/errors.ts`) with a closed set of kinds. Each kind has fixed `retryable` / `canSwitchToLocal` traits and a Persian title and body in `fa.ts`; adding a kind requires both (the `Record<AppErrorKind, ...>` types enforce it). Throw `AppFailure` to carry one through a rejected promise.

### Desktop local engine

`src/platform/tauri/localWhisper.ts` ↔ `src-tauri/src/lib.rs` (the commands) ↔ `src-tauri/src/engine.rs`.

- The Rust side runs whisper.cpp's `whisper-server.exe` as a child process on `127.0.0.1` with a port chosen at start, keeps the model loaded between recordings, and talks to it with a hand-written HTTP multipart request (no HTTP client dependency). It asks for `response_format=json` and returns the clip's text as one segment: `verbose_json` was measured to cost a second pass over the audio. A Windows job object kills the child if the app dies.
- `local_engine_transcribe` takes a raw binary body, not JSON: 4-byte little-endian header length, a JSON header (`model`, `language`, `prompt`), then 16-bit PCM. `buildPayload` in TypeScript and `split_payload` in Rust must change together.
- Rust errors serialize as `{ kind, detail }` with kebab-case kinds; `toFailure` maps them onto `AppErrorKind`.
- The models are listed in `CATALOG` in `src-tauri/src/models.rs` (id, file name, size, SHA-256) and by id in `MODELS` (TypeScript); their Persian descriptions are in `fa.localModels`. `models.rs` also downloads them: in 4 MB range requests into a `.part` file that a later attempt carries on from, renamed only when the checksum matches. The interface side is `LocalModels` (`src/core/models/localModels.ts`) ↔ `src/platform/tauri/models.ts`, with progress over a Tauri `Channel`, and `modelsStore`. `engineOutlook` turns `system_info` (NVIDIA driver, GPU libraries present) into the advice shown above the list; the first model of the catalog is the recommended one on every computer, because the small model was measured to be poor at Persian. The model in use is chosen in that same list (`selectLocalModel`); the engine section offers a model choice only for cloud engines.
- A missing model is its own error kind (`local-model-missing`), so the message can send the user to the download in Settings; `validateConfiguration(model)` checks the model the recording would use.
- The CSP in `tauri.conf.json` allows only `self` and Tauri IPC in `connect-src`. It stays that way: cloud requests and model downloads leave from the native side, not from the web view.

### Cloud services and the AI step

Cloud services (`CloudProviderId`: `openrouter`, `google`) are reached through a `CloudTransport` (`src/core/cloud/transport.ts`): TypeScript builds the JSON request and reads the answer, the platform attaches the key. On the desktop that is `src/platform/tauri/cloud.ts` ↔ `cloud_request` in `src-tauri/src/cloud.rs`, which reads the key from the Windows Credential Manager (`secrets.rs`, entries named `Avanevis/<provider>`) and sends it only to that provider's fixed base address; the path is validated on both sides. The web view can store, replace, test and delete a key but never read one back. Requests go through `ureq` with the system's TLS and honor the Windows system proxy, because VPN apps often work as one.

- `src/core/cloud/errors.ts` maps HTTP answers onto `AppErrorKind` (a 403 that is not JSON is treated as a geo-block).
- `src/core/ai/chat.ts` holds each service's request and answer format (`DIALECTS`), the default models and the key check. Adding a service means a dialect there, a `Provider` variant in Rust and its strings in `fa.cloudProviders`.
- `createChatAIProcessor` sends one request per requested part (clean, summary, title) in parallel and returns what succeeded together with the first error. Prompts are in `src/core/ai/prompts.ts`; bump `PROMPT_VERSION` when their wording changes.
- OpenRouter reports the amount charged; for Google the cost is estimated from a small price table and left out for models not in it.
- The same two services are speech engines too (`createCloudSttProvider` in `src/core/stt/providers/cloud.ts`, provider ids `openrouter` and `google`). Each clip goes out as a base64 WAV inside the JSON request, so the transport and the Rust side are the ones the AI step uses: OpenRouter's `/audio/transcriptions`, and Gemini's `generateContent` with an instruction to transcribe. Both are batch engines, so live text comes from `createChunkedLiveSession` without interim text (every request is paid for). The model lists are fixed in that file; the glossary reaches only the OpenRouter hosts named in `HOSTS_WITH_PROMPT`.

### Real versus demo

`services.ts` distinguishes three builds:

- the desktop app (`hasNativeEngine()`, that is `isTauri()`): real whisper.cpp, keys in the Credential Manager, cloud engines and AI step through the native side;
- the web app (a production build outside Tauri): no local engine (`HAS_LOCAL_ENGINE` is false, and the interface leaves out its advice to fall back on one), the cloud engines and the AI step straight from the browser. `src/platform/web/cloud.ts` sends the requests with `fetch` to the same fixed addresses and keeps each key in IndexedDB, encrypted with a non-extractable WebCrypto key. That keeps a usable key out of storage and backups, not out of reach of code running in the page, which is why the CSP in `public/_headers` matters. Gemini is the fallback engine there;
- the demo (the development server, or `VITE_DEMO=1`): scripted engines (`demo-local`, `demo-cloud`, `demo-failing`) and a scripted AI step, `cloud` is null, and History is seeded once with sample sessions (`SEEDS_DEMO_HISTORY`). `VITE_DEMO=0 pnpm dev` runs the real web app in development.

Provider ids starting with `demo-` make the UI show a demo badge (`isDemoProvider`). Playwright runs against the development server, so e2e tests exercise the demo engine with a real capture pipeline.

### Web app (PWA)

`public/manifest.webmanifest`, the icons and the Apple meta tags in `index.html` make the site installable. `public/sw.js` (registered by `src/platform/web/serviceWorker.ts`, production web builds only) stores the site's own files so the installed app starts offline; it never touches requests to other origins. `public/_headers` carries the response headers for the host (Netlify reads it from the published folder), the CSP among them: `connect-src` lists the two cloud services and must grow with any new one. `netlify.toml` only says how to build.

### Settings and secrets

Preferences are a single localStorage entry (`stt-app.settings.v1`), read through `parseSettings`, which falls back per field so stale or hand-edited data cannot break startup; add new fields there with a default. API keys must never go into this store; `keysStore` holds only whether a key exists.

## Conventions

- Prettier: no semicolons, single quotes, width 100. TypeScript is strict with `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type`) and `erasableSyntaxOnly` (no enums or parameter properties).
- Styling is Tailwind 4 with the default palette removed (`--color-*: initial` in `src/ui/theme/global.css`). Only the role-named tokens exist (`surface`, `ink`, `live`, `accent`, `ai`, `rec`, ...); a stock class such as `bg-blue-500` produces nothing.
- Layout is RTL: use logical properties (`ms-`, `pe-`, `start`, `end`) rather than left/right.
- E2E tests locate elements by their Persian accessible names, so changing a label in `fa.ts` can break tests. The microphone in tests is a generated WAV written to the OS temp folder (`tests/e2e/fakeMicrophone.ts`); use `skipWelcome` from `tests/e2e/helpers.ts` to land on the main screen.
- Code comments, commit messages and documentation are in English; only interface text is Persian.

## Repository hygiene

The repository is meant to become public. Models, engine binaries, audio in any format, benchmark samples and results, and `*.local` pointer files are git-ignored and must stay out of commits, along with keys and machine-specific paths.
