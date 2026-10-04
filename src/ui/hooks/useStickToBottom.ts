import { useEffect, useRef } from 'react'

/** Distance from the bottom within which new content keeps the view pinned. */
const STICK_THRESHOLD_PX = 96

/**
 * Keeps a scroll container at the bottom while `content` grows, unless the user
 * has scrolled up to read something. Scrolling back down re-engages it.
 */
export function useStickToBottom<T extends HTMLElement>(content: unknown) {
  const ref = useRef<T>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight
      pinned.current = distance < STICK_THRESHOLD_PX
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (element && pinned.current) element.scrollTop = element.scrollHeight
  }, [content])

  return ref
}
