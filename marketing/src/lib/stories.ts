/**
 * Pure helpers over the Story shape. Pages and components call these; none
 * of them touch the collection, so they are cheap to reason about.
 */
import type { Story, StorySection, StoryHero, EvidenceItem } from '../data/stories.schema'
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
  const withDrafts = process.env.STORIES_SOURCE === 'fixture' || process.env.STORIES_PREVIEW === '1' || import.meta.env.DEV
  return stories.filter((s) => isPublished(s) || withDrafts)
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
    whatItCountedFor: find('what_it_counted_for'),
  }
}

/**
 * The evidence the page leads with. The API's `hero` when it sends one;
 * for a payload from before 2026-09-12, the old still as an image hero.
 */
export function heroOf(story: Story): StoryHero | null {
  if (story.hero) return story.hero
  if (story.hero_image_url) {
    return { type: 'image', url: story.hero_image_url, alt: story.hero_alt ?? null, caption: null }
  }
  return null
}

/** The hero's still: the image, or the video's poster. Null for a video with no poster. */
export function heroStill(story: Story): string | null {
  const hero = heroOf(story)
  if (!hero) return null
  return hero.type === 'image' ? hero.url : (hero.poster_url ?? null)
}

/** The evidence items that are not the hero, so the page does not show it twice. */
export function evidenceBesidesHero(story: Story): EvidenceItem[] {
  const items = sectionsByKind(story).evidence?.items ?? []
  const hero = heroOf(story)
  if (hero) return items.filter((i) => i.url !== hero.url)
  const text = textHeroOf(story)
  if (!text) return items
  // The quote or document that leads the page is not repeated beneath it.
  return items.filter((i) => i !== text.item)
}

/**
 * What leads a story that has no image or video: the student's first quote,
 * else the first document they submitted. The student's work still goes
 * above every word about it, even when the work is words.
 */
export type TextHero =
  | { kind: 'quote'; text: string; caption: string | null; item: EvidenceItem }
  | { kind: 'document'; url: string; title: string; caption: string | null; item: EvidenceItem }

export function textHeroOf(story: Story): TextHero | null {
  if (heroOf(story)) return null
  const items = sectionsByKind(story).evidence?.items ?? []
  const quote = items.find((i) => i.type === 'quote' && i.text?.trim())
  if (quote) return { kind: 'quote', text: quote.text!.trim(), caption: quote.caption ?? null, item: quote }
  const doc = items.find((i) => i.type === 'document' && i.url)
  if (doc) {
    return {
      kind: 'document',
      url: doc.url!,
      title: doc.alt || 'A document the student submitted',
      caption: doc.caption ?? null,
      item: doc,
    }
  }
  return null
}

/** The first `max` characters of a quote, cut at a word, for a card. */
export function excerpt(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const head = flat.slice(0, max)
  const cut = head.lastIndexOf(' ')
  return `${cut > max * 0.6 ? head.slice(0, cut) : head}\u2026`
}

/** The bucket publishes mp4, mov and webm; the extension is the backend's own, from the MIME it sniffed. */
export function videoType(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mov') return 'video/quicktime'
  return 'video/mp4'
}

/** Seconds as the ISO 8601 duration schema.org wants ("PT1M5S"). Null when unknown. */
export function isoDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null
  const whole = Math.round(seconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const sec = whole % 60
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${sec || (!h && !m) ? `${sec}S` : ''}`
}

/** The platform rule, from the payload when it carries one. */
export const xpPerCredit = (story: Story) => story.credit_rule?.xp_per_credit ?? 2000

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

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/
const VIMEO_ID_RE = /vimeo\.com\/(?:video\/)?(\d+)/

export interface VideoEmbed {
  provider: 'youtube' | 'vimeo'
  id: string
  /** The privacy-friendly player: no cookies until the visitor presses play. */
  src: string
}

/**
 * A YouTube or Vimeo link as an embed, or null for any other URL. The id
 * extraction matches the backend (services/stories/source.py, link_video)
 * and the admin editor's preview, so the three agree on what embeds.
 */
export function videoEmbed(url: string | null | undefined): VideoEmbed | null {
  if (!url) return null
  const yt = url.match(YOUTUBE_ID_RE)
  if (yt) return { provider: 'youtube', id: yt[1], src: `https://www.youtube-nocookie.com/embed/${yt[1]}` }
  const vm = url.match(VIMEO_ID_RE)
  if (vm) return { provider: 'vimeo', id: vm[1], src: `https://player.vimeo.com/video/${vm[1]}?dnt=1` }
  return null
}

/** The host a link points at, without a leading www. Empty for a bad URL. */
export function hostnameOf(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Only the fields a card needs, so a listing page's props stay small. */
export function cardProps(story: Story) {
  const hero = heroOf(story)
  return {
    slug: story.slug,
    title: story.title,
    dek: story.dek,
    subject: story.subject,
    hero,
    hero_still: heroStill(story),
    hero_alt: hero?.alt ?? story.receipt.activity,
    icon: story.receipt.icon,
    setting: story.student.setting,
    published_at: story.published_at,
    text_hero: cardTextHero(story),
  }
}

/** The text hero without the evidence item behind it: a card only renders it. */
function cardTextHero(story: Story) {
  const hero = textHeroOf(story)
  if (!hero) return null
  return hero.kind === 'quote'
    ? { kind: 'quote' as const, excerpt: excerpt(hero.text, 240), caption: hero.caption }
    : { kind: 'document' as const, title: hero.title, caption: hero.caption }
}
export type StoryCardProps = ReturnType<typeof cardProps>
