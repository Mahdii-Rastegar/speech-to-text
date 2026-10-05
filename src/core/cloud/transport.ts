/** Cloud services the user can bring their own key for. */
export type CloudProviderId = 'openrouter' | 'google'

export const CLOUD_PROVIDERS: readonly CloudProviderId[] = ['openrouter', 'google']

export const isCloudProvider = (value: unknown): value is CloudProviderId =>
  CLOUD_PROVIDERS.includes(value as CloudProviderId)

export interface CloudRequest {
  method: 'GET' | 'POST'
  /** Path below the provider's fixed address, starting with a slash. */
  path: string
  /** Sent as JSON. */
  body?: unknown
}

/**
 * Only plain paths below a provider's address: nothing that could point a
 * request, and the key that travels with it, somewhere else.
 */
export const isPlainPath = (path: string): boolean =>
  /^\/[A-Za-z0-9/._:-]*$/.test(path) && !path.includes('..') && !path.includes('//')

export interface CloudResponse {
  status: number
  body: string
}

/**
 * Carries a request to a provider with the user's key attached. The key is
 * added by the platform, out of this code's reach. An answer with an error
 * status is still an answer; only a request that got none rejects, with an AppFailure.
 */
export interface CloudTransport {
  send(provider: CloudProviderId, request: CloudRequest): Promise<CloudResponse>
}

/** Where the keys are kept. A stored key can be replaced or removed, never read back. */
export interface KeyVault {
  has(provider: CloudProviderId): Promise<boolean>
  set(provider: CloudProviderId, key: string): Promise<void>
  remove(provider: CloudProviderId): Promise<void>
}

/** Everything the app needs to use the cloud services on one platform. */
export interface CloudAccess {
  transport: CloudTransport
  keys: KeyVault
}
