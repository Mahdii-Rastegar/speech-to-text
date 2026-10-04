export type AppErrorKind =
  | 'mic-permission-denied'
  | 'mic-unavailable'
  | 'mic-busy'
  | 'live-unsupported'
  | 'provider-unavailable'
  | 'provider-blocked'
  | 'invalid-api-key'
  | 'rate-limited'
  | 'model-unavailable'
  | 'offline'
  | 'timeout'
  | 'unknown'

export interface AppError {
  kind: AppErrorKind
  /** Trying the same action again can reasonably succeed. */
  retryable: boolean
  /** The failure belongs to a cloud service, so the local engine is a way out. */
  canSwitchToLocal: boolean
  /** Technical detail for diagnostics. Never contains secrets. */
  detail?: string
}

const TRAITS: Record<AppErrorKind, Pick<AppError, 'retryable' | 'canSwitchToLocal'>> = {
  'mic-permission-denied': { retryable: false, canSwitchToLocal: false },
  'mic-unavailable': { retryable: true, canSwitchToLocal: false },
  'mic-busy': { retryable: true, canSwitchToLocal: false },
  'live-unsupported': { retryable: false, canSwitchToLocal: true },
  'provider-unavailable': { retryable: true, canSwitchToLocal: true },
  'provider-blocked': { retryable: true, canSwitchToLocal: true },
  'invalid-api-key': { retryable: false, canSwitchToLocal: true },
  'rate-limited': { retryable: true, canSwitchToLocal: true },
  'model-unavailable': { retryable: false, canSwitchToLocal: true },
  offline: { retryable: true, canSwitchToLocal: true },
  timeout: { retryable: true, canSwitchToLocal: true },
  unknown: { retryable: true, canSwitchToLocal: false },
}

export function createAppError(kind: AppErrorKind, detail?: string): AppError {
  return detail === undefined ? { kind, ...TRAITS[kind] } : { kind, ...TRAITS[kind], detail }
}
