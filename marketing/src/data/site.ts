/**
 * Site-wide constants. The app URL is env-driven so the same build works
 * before and after the app moves to its subdomain:
 *   PUBLIC_APP_URL  where the product lives (login, register, terms, privacy)
 *   PUBLIC_API_URL  the Flask API (marketing forms POST /api/contact there)
 */
import { PRICE_TEXT, PRICING } from './pricing.generated'

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

/** Small counts written as words in copy ("six credits a year"). */
const NUMBER_WORDS: Record<number, string> = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six',
  7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve',
}
const numberWord = (n: number): string => {
  const word = NUMBER_WORDS[n]
  if (!word) throw new Error(`site.ts: no word for ${n}; add it to NUMBER_WORDS`)
  return word
}

/**
 * The offer, stated once. Every page reads from here.
 *
 * The site sells one thing: enrollment in Optio Academy. Every price comes
 * from shared/data/pricing.json through ./pricing.generated; to change a
 * price, edit the JSON and run `npm run generate` from the repo root. Never
 * type a dollar amount here or on a page.
 *
 * Tuition-to-credit rule: every academyPerCredit of tuition is one high school
 * credit, so twelve months of tuition covers academyCreditsPerYear credits and
 * four years covers the diploma. Extra credits beyond that pace cost
 * academyPerCredit each.
 */
export const OFFER = {
  academyMonthly: PRICE_TEXT.academyTuitionMonthly,
  academyFamilyCap: PRICE_TEXT.academyFamilyCapMonthly,
  academyYearly: PRICE_TEXT.academyTuitionYearly,
  academyFourYears: PRICE_TEXT.academyDiplomaTotal,
  academyPerCredit: PRICE_TEXT.academyCredit,
  academyCreditsPerYear: numberWord(PRICING.academy.creditsIncludedPerYear),
  academyCreditsPerYearNumeral: PRICE_TEXT.academyCreditsIncludedPerYear,
  academyDiplomaCredits: PRICE_TEXT.diplomaCredits,
  // Full-Time Academy: a dedicated Optio teacher. The price includes tuition
  // (the app's registration config marks it includes_program_fee), so a
  // family pays fullTimeMonthly per student, not fullTimeMonthly + tuition.
  academyTeacherSupportMonthly: PRICE_TEXT.fullTimeMonthly,
  // Prior learning brought in from elsewhere. An accredited school's official
  // transcript transfers free; anything else (homeschool, co-op, a school
  // without accreditation) is reviewed by an Optio Academy teacher at the
  // student's credit price.
  transferAccredited: PRICE_TEXT.transferAccredited,
  transferUnaccreditedPrivate: PRICE_TEXT.transferUnaccreditedPrivate,
  transferUnaccreditedLicensed: PRICE_TEXT.transferUnaccreditedLicensed,
  transferUnaccreditedHalfCredit: PRICE_TEXT.transferUnaccreditedHalfCredit,
  maxTransferCredits: PRICE_TEXT.maxTransferCredits,
  // Schools: a student whose school holds an Optio license pays the licensed
  // (half) price for every credit.
  licensePerStudentYearly: PRICE_TEXT.licensePerStudentYearly,
  licensedPerCredit: PRICE_TEXT.licensedCredit,
  // A credit beyond the included pace: one price for every student, never
  // discounted (Tanner, 2026-10-13).
  acceleratedPerCredit: PRICE_TEXT.acceleratedCredit,
  // The Optio Academy org's parent registration link in the app. `optio-academy`
  // is the human-readable invitation code in org_invitations; the funnel it
  // opens charges academyMonthly per student, capped at academyFamilyCap.
  academyEnrollPath: '/enroll/optio-academy',
}
