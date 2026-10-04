# Avanevis (working name)

Offline-first speech-to-text for Persian and English: live transcription, local Whisper, optional cloud engines and AI clean-up. Windows desktop (Tauri) and iPhone (PWA) from one codebase.

**Status: work in progress.** The interface currently runs on a scripted demo engine. No audio is captured and no network requests are made yet.

## Development

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck
pnpm lint
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # end-to-end tests in the installed Microsoft Edge
pnpm build
```

`node scripts/screenshots.mjs` (with the dev server running) saves screenshots of the main states to `test-results/screens/`.

## Layout

```text
src/core      Pure TypeScript shared by desktop and PWA: session model, STT provider
              contract, recording state machine, AI step, formatting
src/app       Composition root, stores, recording controller
src/audio     Audio input (simulated level for now)
src/ui        React components, design tokens, interface strings (Persian, RTL)
tests/e2e     Playwright tests
```

The product name lives in `src/app/config.ts`.
