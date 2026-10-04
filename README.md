# Avanevis (working name)

Offline-first speech-to-text for Persian and English: live transcription, local Whisper, optional cloud engines and AI clean-up. Windows desktop (Tauri) and iPhone (PWA) from one codebase.

**Status: work in progress.** The microphone is real: capture, the level display and speech/silence detection work. The text still comes from a scripted demo engine. Audio stays in memory on the device; it is not stored and no network requests are made.

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
pnpm build
```

`node scripts/screenshots.mjs` (with the dev server running) saves screenshots of the main states to `test-results/screens/`.

## Layout

```text
src/core      Pure TypeScript shared by desktop and PWA: session model, STT provider
              contract, recording state machine, AI step, formatting, audio math
              (resampling, voice activity detection)
src/app       Composition root, stores, recording controller
src/audio     Microphone capture (16 kHz mono) and the input level meter
src/ui        React components, design tokens, interface strings (Persian, RTL)
tests/e2e     Playwright tests
```

The product name lives in `src/app/config.ts`.
