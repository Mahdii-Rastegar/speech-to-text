/**
 * Runs the Tauri CLI (`pnpm tauri dev`, `pnpm tauri build`, ...) in the
 * environment described in `toolchain.mjs`.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { nativeEnv, projectRoot } from './toolchain.mjs'

const cliPackage = createRequire(import.meta.url).resolve('@tauri-apps/cli/package.json')
const cli = join(dirname(cliPackage), 'tauri.js')

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: nativeEnv(),
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
