/** Small enough to be spread into one call without overflowing the stack. */
const CHUNK_BYTES = 0x8000

/** Bytes as base64 text, the way binary data travels inside a JSON request. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_BYTES))
  }
  return btoa(binary)
}
