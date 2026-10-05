/**
 * Registers the service worker (`public/sw.js`) that keeps the app's own files
 * for the next start, so the installed web app opens without a connection.
 * Only for the built web app: the desktop app has its files on the disk, and
 * a cache would get in the way of development.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    // A failed registration only costs the offline start; the app itself is not affected.
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
