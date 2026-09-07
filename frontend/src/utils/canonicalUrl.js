/**
 * Canonical URLs for the public pages this SPA serves.
 *
 * These pages live on app.optioeducation.com. Until the 2026-09-01 cutover
 * they lived on www, and every canonical in the app was written as a literal
 * `https://www.optioeducation.com/...`. Those literals are now actively
 * harmful rather than merely stale: www 301s each of these paths straight back
 * to app, so a portfolio served at app.optioeducation.com/portfolio/emma was
 * declaring a canonical that redirects to itself. Google does not follow a
 * canonical into a redirect loop and resolve it in your favour - it discards
 * the declared canonical and picks its own, which is how a page ends up
 * indexed under a URL nobody chose, or not indexed at all.
 *
 * So the canonical has to name the host actually serving the page.
 *
 * Non-Optio hosts (localhost, *.onrender.com preview builds) fall back to the
 * production app origin on purpose. A preview deploy that emits its own
 * hostname as canonical is inviting Google to index the preview as the real
 * thing if it ever gets linked.
 */

const PROD_APP_URL = 'https://app.optioeducation.com'

function appOrigin() {
  if (typeof window === 'undefined') return PROD_APP_URL
  const { origin, hostname } = window.location
  return hostname.endsWith('optioeducation.com') ? origin : PROD_APP_URL
}

/**
 * Absolute canonical URL for a path on this host.
 * @param {string} path e.g. '/portfolio/emma' (a leading slash is optional)
 */
export function canonicalUrl(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${appOrigin()}${suffix}`
}

export { PROD_APP_URL }
