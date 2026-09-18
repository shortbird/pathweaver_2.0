/**
 * Site-wide constants. The app URL is env-driven so the same build works
 * before and after the app moves to its subdomain:
 *   PUBLIC_APP_URL  where the product lives (login, register, terms, privacy)
 *   PUBLIC_API_URL  the Flask API (marketing forms POST /api/contact there)
 */
export const SITE = {
  name: 'Optio',
  url: 'https://www.optioeducation.com',
  brandLine: 'Real credit for real life.',
  description:
    'Optio makes real learning count: official, WASC-accredited high school credit for the learning your kid already does.',
  appUrl: import.meta.env.PUBLIC_APP_URL || 'https://app.optioeducation.com',
  apiUrl: import.meta.env.PUBLIC_API_URL || 'https://api.optioeducation.com',
  supportEmail: 'support@optioeducation.com',
  academyEmail: 'tanner@optioeducation.com',
}

export const appLink = (path: string) => `${SITE.appUrl}${path}`

/** Analytics. GA + Meta Pixel fire on the production hosts only. */
export const ANALYTICS = {
  gaMeasurementId: import.meta.env.PUBLIC_GA_MEASUREMENT_ID || 'G-KPKTXS36W3',
  metaPixelId: '621857460806836',
  posthogKey: import.meta.env.PUBLIC_POSTHOG_KEY || '',
  posthogHost: import.meta.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
  prodHosts: ['www.optioeducation.com', 'optioeducation.com'],
}

export const SOCIAL_LINKS = [
  { name: 'YouTube', href: 'https://www.youtube.com/@OptioEducation' },
  { name: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61578980574451' },
  { name: 'Instagram', href: 'https://www.instagram.com/optio_education/' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@optioeducation' },
]

/**
 * The offer, stated once. Every page reads from here.
 *
 * The site sells one thing: enrollment in Optio Academy. The free first class
 * and the $149 individual class retired on 2026-09-17.
 *
 * Tuition-to-credit rule: every $100 of tuition is one high school credit, so
 * 12 x $50 covers six credits a year and four years covers the 24-credit
 * diploma. Extra credits beyond that pace are $100 each. Keep these in step.
 */
export const OFFER = {
  academyMonthly: '$50',
  academyFamilyCap: '$150',
  academyYearly: '$600',
  academyFourYears: '$2,400',
  academyPerCredit: '$100',
  academyCreditsPerYear: 'six',
  academyCreditsPerYearNumeral: '6',
  academyDiplomaCredits: '24',
  // Teacher support add-on. The app's registration config prices it at $500
  // a month with tuition included (includes_program_fee), so a family pays
  // $500, not $550.
  academyTeacherSupportMonthly: '$500',
  // The Optio Academy org's parent registration link in the app. `optio-academy`
  // is the human-readable invitation code in org_invitations; the funnel it
  // opens charges academyMonthly per student, capped at academyFamilyCap.
  academyEnrollPath: '/enroll/optio-academy',
}
