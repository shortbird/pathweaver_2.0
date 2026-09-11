/**
 * Live-reload helpers — recover from stale lazy-chunk loads after a deploy.
 *
 * When a new version is deployed, an already-open tab still holds the old
 * index.html. Navigating to a lazy route whose hashed chunk filename changed makes
 * the browser request a file that no longer exists (404) → "Failed to fetch
 * dynamically imported module", which previously left the page broken until a
 * manual hard refresh. We detect that specific error and reload once (guarded
 * against reload loops) so the browser fetches the fresh index + chunks.
 */

const RELOAD_KEY = 'optio_chunk_reload_at'
const RELOAD_DEBOUNCE_MS = 10000

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i

export function isChunkLoadError(message) {
  return CHUNK_ERROR_RE.test(String(message || ''))
}

/**
 * Reload at most once per debounce window so a persistently-failing chunk can't
 * trap the user in a reload loop. Returns true if a reload was triggered.
 */
export function recoverFromChunkError(now = Date.now(), storage = window.sessionStorage,
                                      reload = () => window.location.reload()) {
  try {
    const last = Number(storage.getItem(RELOAD_KEY) || 0)
    if (now - last < RELOAD_DEBOUNCE_MS) return false
    storage.setItem(RELOAD_KEY, String(now))
  } catch {
    // storage unavailable (private mode / SSR) — still attempt a single reload
  }
  reload()
  return true
}

/** Wire global listeners that recover from stale-chunk load failures. */
export function installChunkErrorRecovery(target = window, recover = recoverFromChunkError) {
  // Vite's own signal for a failed lazy chunk, raised on every browser. The
  // two message-matching listeners below cannot cover Safari: it reports a
  // missing chunk as a bare `TypeError: Load failed`, the same words it uses
  // for any failed fetch, so matching on them would reload the page over a
  // dropped API call. That left iOS users on a stale tab with a broken page
  // after a deploy (Sentry OPTIO-WEB-H, 2026-09-02) until they refreshed by
  // hand. The event carries no message to match; the event itself is the fact.
  target.addEventListener('vite:preloadError', () => {
    recover()
  })
  target.addEventListener('error', (e) => {
    if (isChunkLoadError(e?.message)) recover()
  })
  target.addEventListener('unhandledrejection', (e) => {
    const msg = e?.reason?.message || e?.reason
    if (isChunkLoadError(msg)) recover()
  })
}
