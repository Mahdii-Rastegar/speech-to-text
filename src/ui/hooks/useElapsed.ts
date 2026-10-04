import { useEffect, useState } from 'react'

/** Milliseconds since `startedAt`, refreshed a few times per second while `running`. */
export function useElapsed(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [running])

  return running && startedAt !== null ? Math.max(0, now - startedAt) : 0
}
