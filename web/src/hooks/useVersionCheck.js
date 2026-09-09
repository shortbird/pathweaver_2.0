import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Detects when a newer build has been deployed and reloads safely.
 *
 * How it works:
 * - The build stamps its identity into __APP_VERSION__ (vite.config.js) and emits
 *   /version.json with the same value.
 * - A running tab polls /version.json (no-store). If the deployed version differs
 *   from the one it booted with, an update is available.
 * - To avoid losing in-progress work, we DO NOT force-reload immediately. Instead
 *   we auto-reload on the next route change (a natural safe point — the current
 *   page's state is being torn down anyway), and surface a banner with an explicit
 *   "Reload" button for users who want it now.
 *
 * No-op in dev (when __APP_VERSION__ is unset) and when version.json is missing.
 */

const CURRENT_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

const DEFAULT_POLL_MS = 60_000

export async function fetchDeployedVersion() {
  const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`version.json ${res.status}`)
  const data = await res.json()
  return data?.version
}

export default function useVersionCheck({ pollMs = DEFAULT_POLL_MS } = {}) {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const armedRef = useRef(false)
  const location = useLocation()

  // Poll for a newer deploy (and re-check whenever the tab regains focus).
  useEffect(() => {
    if (CURRENT_VERSION === 'dev') return undefined
    let cancelled = false

    const check = async () => {
      try {
        const deployed = await fetchDeployedVersion()
        if (!cancelled && deployed && deployed !== CURRENT_VERSION) {
          armedRef.current = true
          setUpdateAvailable(true)
        }
      } catch {
        // network blip / not deployed yet — ignore, try again next tick
      }
    }

    const id = setInterval(check, pollMs)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    check()

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pollMs])

  // Auto-reload on the next navigation once an update is pending.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (armedRef.current) {
      window.location.reload()
    }
  }, [location.pathname])

  return { updateAvailable, reload: () => window.location.reload() }
}
