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

/** The offer, stated once. Every page reads from here. */
export const OFFER = {
  freeClassLine: 'Your first class is free.',
  classPrice: '$149',
  classPriceDetail: '$149 per class after your first free one. One semester, 0.5 credit.',
  transferGuarantee:
    'If your school will not accept the credit, we refund you in full. That is the Transfer Guarantee.',
  academyMonthly: '$50',
  academyPerCredit: '$100',
}
