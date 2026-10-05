import { describe, expect, it } from 'vitest'
import { errorFromResponse } from './errors'
import { isPlainPath } from './transport'

const kind = (status: number, body: string) => errorFromResponse({ status, body }).kind
const json = (message: string, status?: string) => JSON.stringify({ error: { message, status } })

describe('errorFromResponse', () => {
  it('recognizes a rejected key in each service’s own wording', () => {
    expect(kind(401, json('No auth credentials found'))).toBe('invalid-api-key')
    expect(
      kind(400, json('API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT')),
    ).toBe('invalid-api-key')
    expect(kind(403, json('Method doesn’t allow unregistered callers', 'PERMISSION_DENIED'))).toBe(
      'invalid-api-key',
    )
  })

  it('tells a geo-block apart from a bad key', () => {
    expect(kind(403, '<html><body>Access denied</body></html>')).toBe('provider-blocked')
    expect(
      kind(400, json('User location is not supported for the API use.', 'FAILED_PRECONDITION')),
    ).toBe('provider-blocked')
    expect(kind(403, json('This service is not available in your region'))).toBe('provider-blocked')
  })

  it('maps the remaining statuses', () => {
    expect(kind(402, json('Insufficient credits'))).toBe('no-credit')
    expect(kind(404, json('models/x is not found', 'NOT_FOUND'))).toBe('model-unavailable')
    expect(kind(400, json('x is not a valid model ID'))).toBe('model-unavailable')
    expect(kind(429, json('Rate limit exceeded'))).toBe('rate-limited')
    expect(kind(503, json('The model is overloaded', 'UNAVAILABLE'))).toBe('provider-unavailable')
    expect(kind(504, '')).toBe('timeout')
    expect(kind(400, json('Invalid JSON payload'))).toBe('unknown')
  })

  it('keeps the service’s explanation as the detail', () => {
    expect(errorFromResponse({ status: 429, body: json('Slow down') }).detail).toBe(
      'HTTP 429: Slow down',
    )
    expect(errorFromResponse({ status: 502, body: '<html>' }).detail).toBe('HTTP 502')
  })
})

describe('isPlainPath', () => {
  it('accepts the paths the services are asked for', () => {
    for (const path of [
      '/chat/completions',
      '/audio/transcriptions',
      '/models/gemini-flash-latest:generateContent',
      '/key',
    ]) {
      expect(isPlainPath(path), path).toBe(true)
    }
  })

  it('refuses anything that could send the key elsewhere', () => {
    for (const path of [
      'key',
      '',
      '/../x',
      '//evil.example/x',
      '/a?key=1',
      '/a#b',
      '/a@b',
      '/a b',
      '/a\\b',
      '/a%2e',
    ]) {
      expect(isPlainPath(path), path).toBe(false)
    }
  })
})
