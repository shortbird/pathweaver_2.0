/**
 * The public story contract, as served by GET /api/public/stories.
 *
 * This is the seam between the backend (backend/routes/stories/public.py,
 * `public_view`) and the static site. The backend projects an allowlist;
 * this schema is the other half of that allowlist. A field the backend adds
 * is ignored here until it is added below, and a field that goes missing
 * fails the build instead of rendering an empty section.
 *
 * `status` is 'published' from the API. The loader stamps 'fixture' on the
 * two entries in stories.fixture.json so no page can mistake them for real
 * stories: every list filters on 'published', and a fixture page renders
 * with noindex.
 */
import { z } from 'astro:content'

export const RECEIPT_ICONS = ['ball', 'controller', 'music', 'brush', 'flask', 'heart', 'run', 'pan'] as const

const markdownSection = (kind: string) =>
  z.object({
    kind: z.literal(kind),
    body_md: z.string(),
    /** Added by the loader: body_md through Astro's markdown renderer. */
    body_html: z.string().optional(),
  })

export const taskRow = z.object({
  title: z.string(),
  subject: z.string(),
  xp: z.number().int().nonnegative(),
  criteria_met: z.number().int().nonnegative(),
  criteria_total: z.number().int().nonnegative(),
  rounds: z.number().int().nonnegative(),
})

export const evidenceItem = z.object({
  type: z.enum(['image', 'video', 'quote', 'document']),
  /** Image, video or document URL. A quote carries its text in `caption`. */
  url: z.string().nullable().optional(),
  alt: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  /** Poster for a video, when the backend has one. */
  thumb_url: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
})

export const criterion = z.object({
  text: z.string(),
  verdict: z.enum(['met', 'partial']),
  note: z.string().nullable().optional(),
})

export const reviewRound = z.object({
  round: z.number().int().positive(),
  date: z.coerce.date(),
  action: z.string(),
  feedback_verbatim: z.string().nullable().optional(),
  what_changed: z.string().nullable().optional(),
})

export const storySection = z.discriminatedUnion('kind', [
  markdownSection('what_they_did'),
  z.object({ kind: z.literal('tasks'), rows: z.array(taskRow) }),
  z.object({ kind: z.literal('evidence'), items: z.array(evidenceItem) }),
  z.object({ kind: z.literal('what_reviewer_looked_for'), criteria: z.array(criterion) }),
  z.object({ kind: z.literal('how_it_went'), rounds: z.array(reviewRound) }),
  markdownSection('what_it_counted_for'),
])

export const storySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase and hyphenated'),
  title: z.string().min(1),
  dek: z.string().min(1),
  status: z.enum(['published', 'fixture']),
  published_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  author: z.object({ name: z.string(), title: z.string() }),
  student: z.object({
    label: z.string(),
    setting: z.enum(['homeschool', 'academy', 'org']),
    grade_band: z.enum(['elementary', 'middle', 'high']).nullable(),
  }),
  activity: z.object({
    /** Matches a slug in src/data/landers.ts when the activity has a lander. */
    slug: z.string().nullable(),
    label: z.string(),
  }),
  receipt: z.object({
    activity: z.string(),
    course: z.string(),
    credit: z.string(),
    icon: z.enum(RECEIPT_ICONS),
  }),
  subject: z.string(),
  subject_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  subject_split: z.array(z.object({ subject: z.string(), xp: z.number().int().nonnegative() })),
  xp_awarded: z.number().int().nonnegative(),
  /** Display string, e.g. "0.5 credit" or "1.5 credits". */
  credit_fraction: z.string(),
  task_count: z.number().int().nonnegative(),
  sections: z.array(storySection),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  hero_image_url: z.string().url().nullable(),
  hero_alt: z.string().nullable().optional(),
  og_image_url: z.string().url().nullable().optional(),
  source: z.object({ type: z.enum(['credit_submission', 'quest', 'learning_moment']) }),
})

export type Story = z.infer<typeof storySchema>
export type StorySection = z.infer<typeof storySection>
export type EvidenceItem = z.infer<typeof evidenceItem>
export type TaskRow = z.infer<typeof taskRow>
export type Criterion = z.infer<typeof criterion>
export type ReviewRound = z.infer<typeof reviewRound>
