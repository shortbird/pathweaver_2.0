import { useState, useEffect } from 'react'

/**
 * `true` while the viewport matches mobile (below Tailwind's `md`
 * breakpoint of 768px). Re-evaluates on resize / orientation change.
 *
 * SSR-safe: returns `false` when `window` is undefined, so pages render
 * the desktop layout during server rendering and swap on hydration.
 */
export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(max-width: 767px)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e) => setIsMobile(e.matches)
    // Sync once in case the initial state ran before matchMedia was ready.
    setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
