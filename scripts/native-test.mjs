/**
 * Runs the unit tests of the native (Rust) side: `pnpm test:native`.
 * Extra arguments go to `cargo test`, for example a test name.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { nativeEnv, projectRoot } from './toolchain.mjs'

const result = spawnSync('cargo', ['test', ...process.argv.slice(2)], {
  cwd: join(projectRoot, 'src-tauri'),
  env: nativeEnv(),
  stdio: 'inherit',
})
if (result.error) console.error(`Could not run cargo: ${result.error.message}`)
process.exit(result.status ?? 1)
