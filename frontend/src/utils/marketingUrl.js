/**
 * Links from the app to the marketing site (marketing/, an Astro static site
 * serving www.optioeducation.com).
 *
 * DEFAULT IS ABSOLUTE. Before the 2026-09-01 cutover this fell back to '' so
 * the links resolved relatively and were served by the SPA's own marketing
 * routes. After the cutover that default became wrong: the SPA moved to
 * app.optioeducation.com, where a relative /schools is not a route at all --
 * it fell through the router to NotFoundRedirect, which sends anonymous
 * visitors to `/`. So the "For schools" link on the public catalog quietly
 * delivered people to the app's stale marketing homepage instead of the real
 * Schools page on www. Same for /academy#free-class and /academy#how-it-works,
 * which landed on the duplicate AcademyPage still routed in this SPA.
 *
 * VITE_MARKETING_URL still overrides, for anyone running `astro dev` locally.
 */
const PROD_MARKETING_URL = 'https://www.optioeducation.com'

export const marketingUrl = (path) =>
  `${import.meta.env.VITE_MARKETING_URL || PROD_MARKETING_URL}${path}`

export { PROD_MARKETING_URL }
