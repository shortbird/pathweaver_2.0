/**
 * Google Analytics 4 (gtag) — the single, code-controlled GA4 initializer.
 *
 * Deliberately narrow, and gated the same way as the Meta Pixel
 * (utils/metaPixel.js) so GA measures the ACQUISITION funnel only:
 *
 *  - Prod host only. Never fires on localhost / dev / preview, so those never
 *    pollute the prod GA property. (initGa no-ops off prod.)
 *  - No user identification. We never send a user id / PII to GA — PostHog is
 *    the product-analytics source of truth for logged-in behaviour.
 *  - Consent Mode v2 defaults deny all ad usage. Optio serves K-12 minors and
 *    never feeds them to ad tools; analytics_storage is granted for basic
 *    pageview measurement, ad_* stays denied.
 *  - Pageviews are sent by GaTracker on SPA route changes (this is an SPA), so
 *    config is created with send_page_view:false to avoid a double initial hit.
 *
 * The measurement id is env-driven (VITE_GA_MEASUREMENT_ID) with a fallback to
 * the live prod property, so prod keeps working if the env var isn't set and a
 * separate property can be pointed at per environment later.
 */

const PROD_HOSTS = ['www.optioeducation.com', 'optioeducation.com']
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-KPKTXS36W3'

let initialized = false

const isProdHost = () =>
  typeof window !== 'undefined' && PROD_HOSTS.includes(window.location.hostname)

// Standard gtag shim — pushes the arguments object (not a spread) onto the
// dataLayer, exactly as Google's snippet does.
function gtag() {
  window.dataLayer.push(arguments)
}

/**
 * Load + configure GA4. No-ops off the prod host or when already initialized.
 * Call once at app startup (alongside initPostHog).
 */
export const initGa = () => {
  if (initialized || !isProdHost() || !MEASUREMENT_ID) return
  initialized = true

  window.dataLayer = window.dataLayer || []

  // Deny ad usage by default (minors); allow basic analytics measurement.
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  })

  gtag('js', new Date())
  gtag('config', MEASUREMENT_ID, { send_page_view: false })

  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
  document.head.appendChild(s)
}

/** Send a SPA page_view. No-op until GA is initialized (i.e. off prod). */
export const gaTrackPageView = (path) => {
  if (!initialized) return
  gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

/**
 * Send a GA4 event. Scope this to ACQUISITION conversions (sign_up,
 * generate_lead) — in-app product events belong in PostHog. No-op off prod.
 * Never pass PII (email/name) here.
 */
export const gaTrackEvent = (name, params = {}) => {
  if (!initialized) return
  gtag('event', name, params)
}
