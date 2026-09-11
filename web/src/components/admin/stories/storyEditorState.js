/**
 * Pure helpers for the story editor. No React, no network.
 *
 * A story's body is an ordered list of sections keyed by `kind`
 * (`story.body.sections`); the helpers here read and patch that list without
 * the editor having to know its index arithmetic. `publishBlockers` is the
 * client-side preview of the server's `publish.blockers()`: the obvious
 * cases only, so the Publish button can explain itself before the round trip.
 * The server's list wins whenever the two disagree.
 */

export const STORY_STATUSES = ['generating', 'review', 'published', 'unpublished', 'failed']

export const STORY_STATUS_LABELS = {
  generating: 'Generating',
  review: 'Needs review',
  published: 'Published',
  unpublished: 'Unpublished',
  failed: 'Failed',
}

export const STORY_STATUS_STYLES = {
  generating: 'bg-optio-purple/10 text-optio-purple-dark',
  review: 'bg-yellow-100 text-yellow-800',
  published: 'bg-emerald-100 text-emerald-800',
  unpublished: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
}

/** Order the marketing site renders the sections in (plan section 1d). */
export const SECTION_ORDER = [
  'what_they_did',
  'tasks',
  'evidence',
  'what_reviewer_looked_for',
  'how_it_went',
  'what_it_counted_for',
]

export const SECTION_TITLES = {
  what_they_did: 'What the student did',
  tasks: 'The tasks',
  evidence: 'What the student submitted as evidence',
  what_reviewer_looked_for: 'What the reviewer looked for',
  how_it_went: 'How the review went',
  what_it_counted_for: 'What it counted for',
}

/** Mirrors marketing/src/data/landers.ts plus `other`. */
export const ACTIVITY_SLUGS = ['piano', 'soccer', 'camp', 'art', 'coding', 'volunteering', 'other']

export const RECEIPT_ICONS = ['ball', 'controller', 'music', 'brush', 'flask', 'heart', 'run', 'pan']

export const SETTING_OPTIONS = [
  { value: 'academy', label: 'Optio Academy' },
  { value: 'homeschool', label: 'Homeschool' },
  { value: 'org', label: 'Partner school' },
]

export const GRADE_BAND_OPTIONS = [
  { value: 'elementary', label: 'Elementary' },
  { value: 'middle', label: 'Middle school' },
  { value: 'high', label: 'High school' },
]

export const CONSENT_SCOPES = [
  { key: 'work', label: 'Student work' },
  { key: 'first_name', label: 'First name' },
  { key: 'image_voice', label: 'Image and voice' },
  { key: 'age', label: 'Age' },
]

export const CONSENT_SOURCES = [
  { value: 'academy_agreement', label: 'Academy agreement' },
  { value: 'org_registration', label: 'Org registration' },
  { value: 'written', label: 'Written' },
]

/** Same rule as DocsArticleEditor.handleTitleChange, so the two CMSes agree. */
export const slugify = (title) => (title || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')

const sections = (story) => story?.body?.sections || []

export const sectionByKind = (story, kind) =>
  sections(story).find(s => s?.kind === kind) || null

/** Evidence items that are not backed by an asset row: quotes and links. */
export const STANDALONE_ITEM_TYPES = ['quote', 'link']

export const isStandaloneItem = (item) =>
  !!item && STANDALONE_ITEM_TYPES.includes(item.type)

/**
 * Why a quote or link the safety pass excluded stays locked in the editor,
 * or null when the tier lets a superadmin bring it back. Mirrors the server
 * (routes/stories/admin.py, _reconcile_standalone_items): a social profile is
 * locked in both tiers; everything else is locked in the anonymized tier
 * and an override in the named one.
 */
export const standaloneLockReason = (item, tier) => {
  if (!item || item.safety?.verdict === 'safe') return null
  if (item.safety?.reason === 'social_profile') return 'Locked: a social profile is never published.'
  if (tier !== 'named') return 'Locked out in the anonymized tier.'
  return null
}

const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/
const VIMEO_ID_RE = /vimeo\.com\/(?:video\/)?(\d+)/

/**
 * A privacy-friendly embed for a YouTube or Vimeo link, or null for any
 * other URL. Same id extraction as the backend (services/stories/source.py,
 * link_video) and the marketing site, so the three agree on what embeds.
 */
export const videoEmbed = (url) => {
  if (!url || typeof url !== 'string') return null
  const yt = url.match(YOUTUBE_ID_RE)
  if (yt) return { provider: 'youtube', id: yt[1], src: `https://www.youtube-nocookie.com/embed/${yt[1]}` }
  const vm = url.match(VIMEO_ID_RE)
  if (vm) return { provider: 'vimeo', id: vm[1], src: `https://player.vimeo.com/video/${vm[1]}?dnt=1` }
  return null
}

/** The host a link points at, without a leading www, for a card's eyebrow. */
export const hostnameOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Patch one section, returning a new story. A section that does not exist
 * yet is appended in canonical order so the preview never shows it out of
 * place. Never mutates its input.
 */
export const updateSection = (story, kind, patch) => {
  const current = sections(story)
  const exists = current.some(s => s?.kind === kind)
  const next = exists
    ? current.map(s => (s?.kind === kind ? { ...s, ...patch } : s))
    : [...current, { kind, ...patch }].sort(
      (a, b) => SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind))
  return { ...story, body: { ...(story?.body || {}), sections: next } }
}

/**
 * Take one of the AI's title options. The slug follows the title only while
 * the story has never been published: a published story's slug is its URL,
 * and a retitle must not move the page.
 */
export const applyTitleOption = (story, title) => {
  const keepSlug = story?.status === 'published' || story?.status === 'unpublished'
  return { ...story, title, slug: keepSlug ? story?.slug : slugify(title) }
}

const blank = (s) => !s || !String(s).trim()

/**
 * The obvious blockers, computed locally. Each entry mirrors the server's
 * shape (`{ code, field, message }`) so the editor renders both lists the
 * same way.
 */
export const publishBlockers = (story, assets = []) => {
  const out = []
  if (blank(story?.title)) {
    out.push({ code: 'empty_title', field: 'title', message: 'The story needs a title.' })
  }
  if (blank(story?.dek)) {
    out.push({ code: 'empty_dek', field: 'dek', message: 'The story needs a dek.' })
  }
  if (blank(sectionByKind(story, 'what_they_did')?.body_md)) {
    out.push({
      code: 'empty_what_they_did',
      field: 'what_they_did',
      message: 'The "What the student did" section is empty.',
    })
  }
  if (story?.hero_asset_id) {
    const hero = (assets || []).find(a => a?.id === story.hero_asset_id)
    if (!hero) {
      out.push({
        code: 'hero_missing',
        field: 'hero_asset_id',
        message: 'The hero image is not one of this story\'s assets.',
      })
    } else if (!hero.included) {
      out.push({
        code: 'hero_excluded',
        field: 'hero_asset_id',
        message: 'The hero image is excluded. Include it or pick another.',
      })
    }
  }
  return out
}
