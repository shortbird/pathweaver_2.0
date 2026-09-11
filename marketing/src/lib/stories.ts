/**
 * Pure helpers over the Story shape. Pages and components call these; none
 * of them touch the collection, so they are cheap to reason about and the
 * summary sentence can be checked by reading it.
 */
import type { Story, StorySection, EvidenceItem, ReviewRound } from '../data/stories.schema'
import { landers, type Lander } from '../data/landers'

export type SectionOf<K extends StorySection['kind']> = Extract<StorySection, { kind: K }>

export const isPublished = (story: Story) => story.status === 'published'

/**
 * Stories a listing page may show. Production lists show published stories
 * only. On a developer's machine (astro dev, or STORIES_SOURCE=fixture,
 * which the loader refuses on Render) the fixtures are listed too so the
 * index, hub and related-story layouts can be checked. A page that lists a
 * fixture must pass listingNoindex(...) to the layout.
 */
export function listable(stories: Story[]): Story[] {
  const withFixtures = process.env.STORIES_SOURCE === 'fixture' || import.meta.env.DEV
  return stories.filter((s) => isPublished(s) || withFixtures)
}

export const listingNoindex = (stories: Story[]) => stories.some((s) => !isPublished(s))

export const byNewest = (a: Story, b: Story) => b.published_at.valueOf() - a.published_at.valueOf()

export function subjectSlug(subject: string): string {
  return subject
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const storyUrl = (story: Pick<Story, 'slug'>) => `/stories/${story.slug}/`
export const subjectUrl = (slug: string) => `/stories/subject/${slug}/`
export const ogImagePath = (story: Pick<Story, 'slug'>) => `/images/og/stories/${story.slug}.png`

export function landerFor(story: Story): Lander | undefined {
  if (!story.activity.slug) return undefined
  return landers.find((l) => l.slug === story.activity.slug)
}

export function related(story: Story, all: Story[], limit = 3): Story[] {
  return all
    .filter((s) => s.slug !== story.slug && s.subject_slug === story.subject_slug)
    .sort(byNewest)
    .slice(0, limit)
}

export function sectionsByKind(story: Story) {
  const find = <K extends StorySection['kind']>(kind: K) =>
    story.sections.find((s): s is SectionOf<K> => s.kind === kind)
  return {
    whatTheyDid: find('what_they_did'),
    tasks: find('tasks'),
    evidence: find('evidence'),
    criteria: find('what_reviewer_looked_for'),
    howItWent: find('how_it_went'),
    whatItCountedFor: find('what_it_counted_for'),
  }
}

/** Subjects grouped for the index page: [{ subject, slug, stories }], largest group first. */
export function groupBySubject(stories: Story[]) {
  const groups = new Map<string, { subject: string; slug: string; stories: Story[] }>()
  for (const story of [...stories].sort(byNewest)) {
    const group = groups.get(story.subject_slug) ?? { subject: story.subject, slug: story.subject_slug, stories: [] }
    group.stories.push(story)
    groups.set(story.subject_slug, group)
  }
  return [...groups.values()].sort((a, b) => b.stories.length - a.stories.length || a.subject.localeCompare(b.subject))
}

export interface ReviewStats {
  rounds: number
  firstSubmission: Date | null
  awarded: Date | null
  /** Calendar days from the first submission to the award, when both dates exist. */
  daysToAward: number | null
}

export function reviewStats(story: Story): ReviewStats {
  const rounds: ReviewRound[] = sectionsByKind(story).howItWent?.rounds ?? []
  if (rounds.length === 0) return { rounds: 0, firstSubmission: null, awarded: null, daysToAward: null }
  const dates = rounds.map((r) => r.date.valueOf())
  const first = new Date(Math.min(...dates))
  const last = new Date(Math.max(...dates))
  const days = Math.round((last.valueOf() - first.valueOf()) / 86_400_000)
  return { rounds: rounds.length, firstSubmission: first, awarded: last, daysToAward: days }
}

const SMALL_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

export function numberWord(n: number): string {
  return n >= 0 && n < SMALL_NUMBERS.length ? SMALL_NUMBERS[n] : String(n)
}

function withArticle(label: string): string {
  const trimmed = label.trim()
  if (/^(a|an|the)\s/i.test(trimmed)) return trimmed
  const article = /^[aeiou]/i.test(trimmed) ? 'An' : 'A'
  return `${article} ${trimmed}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function joinNames(names: string[]): string {
  const unique = [...new Set(names)]
  if (unique.length <= 1) return unique[0] ?? ''
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`
}

export const SETTING_LABEL: Record<Story['student']['setting'], string> = {
  academy: 'Optio Academy',
  homeschool: 'Homeschool',
  org: 'Partner school',
}

export const GRADE_BAND_LABEL: Record<NonNullable<Story['student']['grade_band']>, string> = {
  elementary: 'Elementary',
  middle: 'Middle school',
  high: 'High school',
}

function settingClause(setting: Story['student']['setting']): string {
  switch (setting) {
    case 'academy':
      return 'at Optio Academy'
    case 'org':
      return 'at an Optio partner school'
    default:
      return 'through Optio'
  }
}

/**
 * The one-sentence answer at the top of a story page, built from fields the
 * backend fixes deterministically (never from the AI draft), so the sentence
 * an answer engine quotes is the same fact the transcript shows.
 */
export function summarySentence(story: Story): string {
  const subjects = story.subject_split.length > 0 ? story.subject_split.map((s) => s.subject) : [story.subject]
  const unique = [...new Set(subjects)]
  const subjectPhrase = unique.length > 1 ? `across ${joinNames(unique)}` : `of ${unique[0]}`

  if (story.source.type === 'quest') {
    const label = story.activity.label.trim().replace(/^(a|an|the)\s+/i, '')
    const tasks = story.task_count > 0 ? `${numberWord(story.task_count)}-task ` : ''
    const article = /^[aeiou]/i.test(tasks || label) ? 'An' : 'A'
    return `${article} ${tasks}${label} earned ${story.credit_fraction} ${subjectPhrase}.`
  }

  const { rounds } = reviewStats(story)
  const roundsClause = rounds > 0 ? ` after ${numberWord(rounds)} review round${rounds === 1 ? '' : 's'}` : ''
  return `${capitalize(withArticle(story.activity.label))} earned ${story.credit_fraction} ${subjectPhrase} ${settingClause(story.student.setting)}${roundsClause}.`
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export const isImage = (item: EvidenceItem) => item.type === 'image' && typeof item.url === 'string'

/** Only the fields a card needs, so a listing page's props stay small. */
export function cardProps(story: Story) {
  return {
    slug: story.slug,
    title: story.title,
    dek: story.dek,
    subject: story.subject,
    credit_fraction: story.credit_fraction,
    hero_image_url: story.hero_image_url,
    hero_alt: story.hero_alt ?? story.receipt.activity,
    icon: story.receipt.icon,
    setting: story.student.setting,
    published_at: story.published_at,
  }
}
export type StoryCardProps = ReturnType<typeof cardProps>
