import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'pointerdown', 'scroll']

/**
 * I1: when enabled (a Treehouse kiosk / focus-mode session on a shared device),
 * run `onIdle` after `timeoutMs` of no interaction. Used to return the shared
 * device to the student picker so a child who walks away doesn't leave their
 * quest open for the next student. No-op for normal (non-kiosk) sessions.
 */
export function useKioskIdleTimeout({ enabled, timeoutMs = 3 * 60 * 1000, onIdle }) {
  const timer = useRef(null)
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!enabled) return
    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => onIdleRef.current && onIdleRef.current(), timeoutMs)
    }
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    const onVisible = () => { if (document.visibilityState === 'visible') reset() }
    document.addEventListener('visibilitychange', onVisible)
    reset()
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
      document.removeEventListener('visibilitychange', onVisible)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [enabled, timeoutMs])
}
