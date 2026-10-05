/** A model of the local engine, as the platform reports it. */
export interface LocalModelStatus {
  id: string
  /** Size of the complete file. */
  bytes: number
  installed: boolean
  /** How much of an unfinished download is already on the disk. */
  downloadedBytes: number
}

/** What this computer offers the local engine. */
export interface SystemInfo {
  /** Logical processors. */
  cores: number
  /** An NVIDIA graphics driver is installed. */
  nvidia: boolean
  /** The engine's own graphics-card libraries are in place. */
  gpuPack: boolean
}

export interface DownloadProgress {
  received: number
  total: number
}

export type ModelFailureKind = 'offline' | 'timeout' | 'blocked' | 'corrupt' | 'disk' | 'failed'

export type DownloadOutcome =
  | { status: 'installed' }
  /** Stopped by the user. What arrived is kept for the next attempt. */
  | { status: 'stopped' }
  | { status: 'failed'; kind: ModelFailureKind }

/** The local engine's model files on one platform. */
export interface LocalModels {
  list(): Promise<LocalModelStatus[]>
  system(): Promise<SystemInfo>
  /** Fetches a model, carrying on from an earlier attempt. Settles when the download ends, however it ends. */
  download(id: string, onProgress: (progress: DownloadProgress) => void): Promise<DownloadOutcome>
  stop(id: string): Promise<void>
  /** Removes the model's file and whatever is left of a download. */
  remove(id: string): Promise<void>
}

/** How the local engine will run here. */
export type EngineOutlook = 'gpu' | 'gpu-pack-missing' | 'cpu'

export function engineOutlook(system: SystemInfo): EngineOutlook {
  if (!system.nvidia) return 'cpu'
  return system.gpuPack ? 'gpu' : 'gpu-pack-missing'
}
