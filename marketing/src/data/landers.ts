/**
 * Campaign landers, one per activity vertical (April 2026 marketing strategy).
 * Adding a lander = adding an entry here. No new page file needed:
 * src/pages/l/[activity].astro generates a page per entry, and
 * scripts/generate-og.mjs generates its OG image.
 *
 * heroImage: real footage of the activity, when we have it (with consent).
 * TODO(tanner): supply real activity photos; the lander renders a clean
 * receipt-led hero without one, so null is fine at launch.
 */
export interface Lander {
  slug: string
  activity: string          // what the student already does, lowercase mid-sentence
  headline: string          // "Your [activity] is a [subject] class."
  subject: string           // transcript language
  credit: string
  receipt: {
    activity: string        // the real-life line on the receipt
    course: string          // the transcript row it becomes
    credit: string
    icon: string            // key into Receipt.astro's icon set
  }
  heroImage: string | null
  description: string       // meta description
}

export const landers: Lander[] = [
  {
    slug: 'piano',
    activity: 'piano lessons',
    headline: 'Your piano is a music class.',
    subject: 'Music',
    credit: '0.5 credit',
    receipt: { activity: 'A semester of piano lessons', course: 'Music', credit: '0.5 credit', icon: 'music' },
    heroImage: null,
    description:
      'Already taking piano lessons? Optio turns them into official, WASC-accredited high school music credit. First class free.',
  },
  {
    slug: 'soccer',
    activity: 'soccer season',
    headline: 'Your soccer season is a PE class.',
    subject: 'Physical Education',
    credit: '0.5 credit',
    receipt: { activity: 'Fall club soccer season', course: 'Physical Education', credit: '0.5 credit', icon: 'ball' },
    heroImage: null,
    description:
      'Play club or rec soccer? Optio turns your season into official, WASC-accredited high school PE credit. First class free.',
  },
  {
    slug: 'camp',
    activity: 'summer camp',
    headline: 'Your summer camp is a science class.',
    subject: 'Science',
    credit: '0.5 credit',
    receipt: { activity: 'Two weeks of summer camp', course: 'Science', credit: '0.5 credit', icon: 'flask' },
    heroImage: null,
    description:
      'Went to summer camp? Optio turns what you did there into official, WASC-accredited high school science credit. First class free.',
  },
  {
    slug: 'art',
    activity: 'art practice',
    headline: 'Your art is a fine arts class.',
    subject: 'Fine Arts',
    credit: '0.5 credit',
    receipt: { activity: 'A sketchbook of finished pieces', course: 'Fine Arts', credit: '0.5 credit', icon: 'brush' },
    heroImage: null,
    description:
      'Drawing, painting, or making digital art? Optio turns your practice into official, WASC-accredited fine arts credit. First class free.',
  },
  {
    slug: 'coding',
    activity: 'coding projects',
    headline: 'Your game is a computer science class.',
    subject: 'Computer Science',
    credit: '0.5 credit',
    receipt: { activity: 'A game you built and shipped', course: 'Computer Science', credit: '0.5 credit', icon: 'controller' },
    heroImage: null,
    description:
      'Building games, apps, or websites? Optio turns your projects into official, WASC-accredited computer science credit. First class free.',
  },
  {
    slug: 'volunteering',
    activity: 'volunteer work',
    headline: 'Your volunteer work is a civics class.',
    subject: 'Civics',
    credit: '0.5 credit',
    receipt: { activity: 'A season of shelter shifts', course: 'Civics', credit: '0.5 credit', icon: 'heart' },
    heroImage: null,
    description:
      'Volunteering in your community? Optio turns that work into official, WASC-accredited high school civics credit. First class free.',
  },
]
