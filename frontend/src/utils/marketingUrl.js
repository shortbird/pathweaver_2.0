/**
 * Links from the app to the marketing site (which lives in marketing/ and
 * deploys as a static site at the root domain).
 *
 * Until the DNS cutover, VITE_MARKETING_URL is unset and these resolve to
 * relative paths, which the SPA's own marketing routes still serve. After the
 * cutover (app on app.optioeducation.com, marketing on the root domain), set
 * VITE_MARKETING_URL=https://www.optioeducation.com on the app services and
 * the same links land on the static site.
 */
export const marketingUrl = (path) =>
  `${import.meta.env.VITE_MARKETING_URL || ''}${path}`
