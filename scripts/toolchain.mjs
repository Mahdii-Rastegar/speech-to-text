/**
 * The environment the native (Rust) side is built and tested in.
 *
 * With Rust and the Visual Studio C++ build tools installed the usual way, this
 * is just the current environment. It also supports a self-contained toolchain
 * folder that is not on PATH, so the build tools can live on any drive without
 * changing system settings. Point to that folder with the STT_TOOLCHAIN_DIR
 * environment variable, or put its path on the first line of a `toolchain.local`
 * file next to package.json (not committed). Expected content of the folder:
 *
 *   cargo/   rustup/        CARGO_HOME and RUSTUP_HOME
 *   msvc/                   output of mmozeiko's portable-msvc.py
 *
 * The local speech engine uses the graphics card only if it finds the cuBLAS
 * libraries (cublas64_11.dll, cublasLt64_11.dll). If they are not beside the
 * engine, name their folder in STT_CUDA_DLL_DIR or on the first line of a
 * `cuda.local` file (not committed). Without them the engine runs on the CPU.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** A folder named by an environment variable or by the first line of a local pointer file. */
function localFolder(variable, pointerFile) {
  if (process.env[variable]) return process.env[variable]
  const pointer = join(projectRoot, pointerFile)
  if (!existsSync(pointer)) return undefined
  return readFileSync(pointer, 'utf8').split(/\r?\n/)[0].trim() || undefined
}

/** The only (or newest) version folder inside `directory`. */
function versionIn(directory) {
  const versions = readdirSync(directory).sort()
  if (versions.length === 0) throw new Error(`No version folder in ${directory}`)
  return join(directory, versions[versions.length - 1])
}

function prepend(env, name, entries) {
  // Windows environment names are case-insensitive, but a plain object is not.
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name
  env[key] = [...entries, env[key]].filter(Boolean).join(delimiter)
}

function portableToolchainEnv(root) {
  if (!existsSync(root)) throw new Error(`Toolchain folder not found: ${root}`)
  const env = { ...process.env }
  const path = []

  if (existsSync(join(root, 'cargo'))) {
    env.CARGO_HOME = join(root, 'cargo')
    env.RUSTUP_HOME = join(root, 'rustup')
    path.push(join(root, 'cargo', 'bin'))
  }

  const msvcRoot = join(root, 'msvc')
  if (existsSync(msvcRoot)) {
    const msvc = versionIn(join(msvcRoot, 'VC', 'Tools', 'MSVC'))
    const kit = join(msvcRoot, 'Windows Kits', '10')
    const sdk = versionIn(join(kit, 'Include')).split(/[\\/]/).pop()
    const include = join(kit, 'Include', sdk)
    const lib = join(kit, 'Lib', sdk)

    path.push(join(msvc, 'bin', 'Hostx64', 'x64'), join(kit, 'bin', sdk, 'x64'))
    prepend(env, 'INCLUDE', [
      join(msvc, 'include'),
      ...['ucrt', 'shared', 'um', 'winrt', 'cppwinrt'].map((part) => join(include, part)),
    ])
    prepend(env, 'LIB', [
      join(msvc, 'lib', 'x64'),
      join(lib, 'ucrt', 'x64'),
      join(lib, 'um', 'x64'),
    ])
  }

  prepend(env, 'PATH', path)
  return env
}

/** The current environment, with the build tools and the GPU libraries made findable. */
export function nativeEnv() {
  const root = localFolder('STT_TOOLCHAIN_DIR', 'toolchain.local')
  const env = root ? portableToolchainEnv(root) : { ...process.env }

  const cudaDir = localFolder('STT_CUDA_DLL_DIR', 'cuda.local')
  if (cudaDir) env.STT_CUDA_DLL_DIR = cudaDir
  return env
}
