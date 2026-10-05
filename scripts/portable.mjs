/**
 * Builds the portable app: one folder that runs from wherever it is copied to.
 *
 *   pnpm portable                 build the app and assemble portable/Avanevis
 *   pnpm portable --skip-build    assemble from the executable that is already built
 *   pnpm portable --with-model    also copy the recommended model, for a computer without internet
 *   pnpm portable --gpu           also assemble portable/Avanevis-gpu-pack (NVIDIA cards only)
 *
 * What ends up in the folder:
 *
 *   Avanevis.exe     the app, with the C runtime linked in
 *   engine/          whisper.cpp's server and its CPU libraries, with the Microsoft
 *                    runtime libraries they need beside them
 *   models/          empty unless --with-model; the app downloads models into it
 *   licenses/        notices of the third-party parts
 *   README.txt
 *
 * The app creates `data/` (History, settings) beside itself on first run. That
 * folder is personal and is never part of what this script produces. Running
 * the script again replaces the app's own files and leaves `data/`, `models/`
 * and anything else in the folder alone.
 *
 * The GPU pack is kept apart because it is about a gigabyte and useless without
 * an NVIDIA card: its files are copied into `engine/` by whoever wants them.
 * It needs the cuBLAS libraries, found the way scripts/tauri.mjs finds them
 * (STT_CUDA_DLL_DIR or `cuda.local`), or beside the engine.
 *
 * The engine itself comes from STT_ENGINE_DIR, `engine/`, or
 * `bench/tools/whisper-cpp/Release`: an unpacked Windows release of whisper.cpp.
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const flags = new Set(process.argv.slice(2))
const known = ['--skip-build', '--with-model', '--gpu']
for (const flag of flags) {
  if (!known.includes(flag)) fail(`Unknown option ${flag}. Options: ${known.join(', ')}`)
}

const APP_NAME = 'Avanevis'
const outRoot = join(projectRoot, 'portable')
const appDir = join(outRoot, APP_NAME)
const gpuDir = join(outRoot, `${APP_NAME}-gpu-pack`)

/** The model the app recommends first (`CATALOG` in src-tauri/src/models.rs). */
const MODEL_FILE = 'ggml-large-v3-turbo-q5_0.bin'

const ENGINE_FILES = ['whisper-server.exe', 'whisper.dll', 'ggml.dll', 'ggml-base.dll']
const ENGINE_CPU_LIBRARIES = /^ggml-cpu-.+\.dll$/
/** Microsoft's C++ and OpenMP runtime, which the engine expects to find on the computer. */
const RUNTIME_LIBRARIES = ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'vcomp140.dll']
const GPU_ENGINE_FILES = ['ggml-cuda.dll', 'cudart64_110.dll']
const GPU_CUBLAS_FILES = ['cublas64_11.dll', 'cublasLt64_11.dll']

function fail(message) {
  console.error(`\n${message}\n`)
  process.exit(1)
}

/** A folder named by an environment variable or by the first line of a local pointer file. */
function localFolder(variable, pointerFile) {
  if (process.env[variable]) return process.env[variable]
  const pointer = join(projectRoot, pointerFile)
  if (!existsSync(pointer)) return undefined
  return readFileSync(pointer, 'utf8').split(/\r?\n/)[0].trim() || undefined
}

function firstExisting(candidates, what) {
  const found = candidates.filter(Boolean).find((candidate) => existsSync(candidate))
  if (!found) fail(`${what} not found. Looked in:\n  ${candidates.filter(Boolean).join('\n  ')}`)
  return found
}

function copy(from, toDir) {
  mkdirSync(toDir, { recursive: true })
  copyFileSync(from, join(toDir, from.split(/[\\/]/).pop()))
}

function megabytes(dir) {
  const total = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0)
  return Math.round(total / (1024 * 1024))
}

// --------------------------------------------------------------------------
// The app
// --------------------------------------------------------------------------

if (!flags.has('--skip-build')) {
  // The C runtime goes into the executable, so the app starts on a computer
  // that never had Microsoft's runtime package installed.
  const result = spawnSync(process.execPath, [join(projectRoot, 'scripts', 'tauri.mjs'), 'build'], {
    cwd: projectRoot,
    env: { ...process.env, RUSTFLAGS: '-C target-feature=+crt-static' },
    stdio: 'inherit',
  })
  if (result.status !== 0) fail('The build failed; nothing was assembled.')
}

const releaseDir = join(projectRoot, 'src-tauri', 'target', 'release')
const builtExe = firstExisting(
  [join(releaseDir, `${APP_NAME}.exe`), join(releaseDir, 'stt-app.exe')],
  'The built executable',
)

const engineSource = dirname(
  firstExisting(
    [
      process.env.STT_ENGINE_DIR && join(process.env.STT_ENGINE_DIR, ENGINE_FILES[0]),
      join(projectRoot, 'engine', ENGINE_FILES[0]),
      join(projectRoot, 'bench', 'tools', 'whisper-cpp', 'Release', ENGINE_FILES[0]),
    ],
    'The local engine (whisper-server.exe)',
  ),
)

/** Where a runtime library can be taken from: the build tools first, then Windows itself. */
function runtimeLibrary(name) {
  const toolchain = localFolder('STT_TOOLCHAIN_DIR', 'toolchain.local')
  const candidates = []
  const versions = toolchain && join(toolchain, 'msvc', 'VC', 'Tools', 'MSVC')
  if (versions && existsSync(versions)) {
    for (const version of readdirSync(versions).sort().reverse()) {
      candidates.push(join(versions, version, 'bin', 'Hostx64', 'x64', name))
    }
  }
  candidates.push(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', name))
  return firstExisting(candidates, `The runtime library ${name}`)
}

// An existing folder is updated in place: it may be in use, with downloaded
// models, a `data` folder and the GPU pack's files in `engine`, none of which
// this script may take away.
mkdirSync(join(appDir, 'models'), { recursive: true })
copyFileSync(builtExe, join(appDir, `${APP_NAME}.exe`))

const engineDir = join(appDir, 'engine')
for (const file of ENGINE_FILES) copy(join(engineSource, file), engineDir)
const cpuLibraries = readdirSync(engineSource).filter((file) => ENGINE_CPU_LIBRARIES.test(file))
if (cpuLibraries.length === 0) fail(`No ggml-cpu-*.dll in ${engineSource}`)
for (const file of cpuLibraries) copy(join(engineSource, file), engineDir)
for (const file of RUNTIME_LIBRARIES) copy(runtimeLibrary(file), engineDir)

const packaging = join(projectRoot, 'scripts', 'portable')
copyFileSync(join(packaging, 'README.txt'), join(appDir, 'README.txt'))
for (const notice of readdirSync(join(packaging, 'licenses'))) {
  copy(join(packaging, 'licenses', notice), join(appDir, 'licenses'))
}

if (flags.has('--with-model')) {
  const model = firstExisting(
    [
      process.env.STT_MODELS_DIR && join(process.env.STT_MODELS_DIR, MODEL_FILE),
      join(projectRoot, 'models', MODEL_FILE),
      join(projectRoot, 'models', 'ggml', MODEL_FILE),
    ],
    `The model file ${MODEL_FILE}`,
  )
  copy(model, join(appDir, 'models'))
}

console.log(`\n${appDir}  (${megabytes(appDir)} MB)`)

// --------------------------------------------------------------------------
// The GPU pack
// --------------------------------------------------------------------------

if (flags.has('--gpu')) {
  const cudaDir = localFolder('STT_CUDA_DLL_DIR', 'cuda.local')
  rmSync(gpuDir, { recursive: true, force: true })
  const gpuEngineDir = join(gpuDir, 'engine')
  for (const file of GPU_ENGINE_FILES) copy(join(engineSource, file), gpuEngineDir)
  for (const file of GPU_CUBLAS_FILES) {
    copy(
      firstExisting(
        [join(engineSource, file), cudaDir && join(cudaDir, file)],
        `The library ${file}`,
      ),
      gpuEngineDir,
    )
  }
  copyFileSync(join(packaging, 'README-gpu.txt'), join(gpuDir, 'README.txt'))
  console.log(`${gpuDir}  (${megabytes(gpuDir)} MB)`)
}
