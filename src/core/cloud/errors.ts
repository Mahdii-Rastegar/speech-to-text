import { createAppError, type AppError, type AppErrorKind } from '../errors'
import type { CloudResponse } from './transport'

/** The service's own explanation, wherever its error format keeps it. */
function messageOf(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown; status?: unknown } | string }
    const error = parsed.error
    if (typeof error === 'string') return error
    if (error && typeof error.message === 'string') {
      return typeof error.status === 'string' ? `${error.status}: ${error.message}` : error.message
    }
  } catch {
    // Not JSON: an error page from something in between, not from the service itself.
  }
  return null
}

const mentions = (text: string, pattern: RegExp) => pattern.test(text)

const REGION = /location|region|country|territory/i
const BAD_KEY = /api[ _-]?key|unregistered callers|credential|permission_denied/i
const NO_CREDIT = /credit|billing|payment/i
const MODEL = /model/i

function kindOf(status: number, message: string | null): AppErrorKind {
  const text = message ?? ''
  // Geo-blocking arrives as 403 with a web page, or as a 400 that names the user's location.
  if (mentions(text, REGION) && (status === 400 || status === 403)) return 'provider-blocked'
  switch (status) {
    case 400:
      if (mentions(text, BAD_KEY)) return 'invalid-api-key'
      return mentions(text, MODEL) ? 'model-unavailable' : 'unknown'
    case 401:
      return 'invalid-api-key'
    case 402:
      return 'no-credit'
    case 403:
      if (message === null) return 'provider-blocked'
      return mentions(text, NO_CREDIT) ? 'no-credit' : 'invalid-api-key'
    case 404:
      return 'model-unavailable'
    case 408:
    case 504:
      return 'timeout'
    case 429:
      return 'rate-limited'
    default:
      return status >= 500 ? 'provider-unavailable' : 'unknown'
  }
}

/** Turns an answer with an error status into the app's own error. */
export function errorFromResponse(response: CloudResponse): AppError {
  const message = messageOf(response.body)
  const detail = `HTTP ${response.status}${message ? `: ${message.slice(0, 300)}` : ''}`
  return createAppError(kindOf(response.status, message), detail)
}
