/**
 * Meta (Facebook) Pixel helpers.
 *
 * The base pixel and the initial PageView are installed in index.html. These
 * helpers centralize every additional fbq() call so tracking is consistent and
 * can never throw into the app if the pixel is blocked, absent, or still loading.
 *
 * IMPORTANT (COPPA / our privacy policy): we never send personally identifying
 * information (email, name, etc.) to the pixel via Advanced Matching, because
 * this is a K-12 platform and many users are minors. Keep these helpers
 * PII-free — they should only ever send event names + non-identifying params.
 */

const pixelAvailable = () =>
  typeof window !== 'undefined' && typeof window.fbq === 'function'

/** Fire a Meta Pixel PageView (used for SPA route changes). */
export function trackPageView() {
  if (!pixelAvailable()) return
  try {
    window.fbq('track', 'PageView')
  } catch {
    /* never let analytics break navigation */
  }
}

/**
 * Fire a Meta Pixel standard or custom event.
 * @param {string} event  e.g. 'Lead', 'CompleteRegistration'
 * @param {object} [params] non-identifying event params (no PII)
 */
export function trackEvent(event, params = {}) {
  if (!pixelAvailable()) return
  try {
    window.fbq('track', event, params)
  } catch {
    /* swallow — tracking must never throw */
  }
}
