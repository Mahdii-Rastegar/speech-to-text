export interface MicrophoneInfo {
  deviceId: string
  /** Name given by the system. Empty until the microphone permission has been granted. */
  label: string
}

/**
 * Chromium lists the system's default and "communications" devices a second
 * time under these ids. The real devices are in the list too, so the aliases
 * are left out and "system default" is offered as its own choice instead.
 */
const ALIAS_IDS = new Set(['default', 'communications'])

/** The microphones the system offers right now. */
export async function listMicrophones(): Promise<MicrophoneInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((device) => device.kind === 'audioinput' && !ALIAS_IDS.has(device.deviceId))
      .map((device) => ({ deviceId: device.deviceId, label: device.label }))
  } catch {
    return []
  }
}

/**
 * Asks for the microphone once and lets go of it immediately. Device names are
 * hidden until the permission exists, so this is what makes the list readable.
 * Call it from a click or tap.
 */
export async function requestMicrophoneAccess(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach((track) => track.stop())
    return true
  } catch {
    return false
  }
}

/** Calls `listener` when a microphone is plugged in or removed. Returns the unsubscribe function. */
export function onMicrophonesChanged(listener: () => void): () => void {
  const devices = navigator.mediaDevices
  if (!devices?.addEventListener) return () => {}
  devices.addEventListener('devicechange', listener)
  return () => devices.removeEventListener('devicechange', listener)
}
