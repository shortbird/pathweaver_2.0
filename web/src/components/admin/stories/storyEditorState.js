import { XP_PER_CREDIT } from '../../../utils/creditRequirements'

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

/**
 * Order the marketing site renders the sections in. `how_it_went` (the
 * review rounds) left the page on 2026-09-12; older rows still carry it in
 * `body.sections`, and it is preserved on save but never rendered.
 */
export const SECTION_ORDER = [
  'what_they_did',
  'tasks',
  'evidence',
  'what_reviewer_looked_for',
  'what_it_counted_for',
]

export const SECTION_TITLES = {
  what_they_did: 'What the student did',
  tasks: 'The tasks',
  evidence: 'More of the evidence',
  what_reviewer_looked_for: 'What the teacher checked',
  what_it_counted_for: 'What it counted for',
}

/** What the page shows a title and a dek as; Google truncates past these. */
export const TITLE_TARGET_CHARS = 60
export const DEK_TARGET_CHARS = 155

/**
 * The sentence the page prints under "What it counted for", so the preview
 * says what the site says. Mirrors marketing/src/data/howItWorks.ts; the
 * site reads the number from the API, this preview from the shared table.
 */
/**
 * The receipt's second line as the page prints it: the XP when the credit is
 * a sliver of one (a task is 0.05 credit, which reads as a joke), the credit
 * line from half a credit up. Mirrors publish.receipt_credit_line.
 */
export const RECEIPT_XP_BELOW_CREDITS = 0.5
export const receiptCreditLine = (story) => {
  const fraction = Number(story?.credit_fraction || 0)
  const xp = Number(story?.xp_awarded || 0)
  if (xp > 0 && fraction > 0 && fraction < RECEIPT_XP_BELOW_CREDITS) return `${xp.toLocaleString('en-US')} XP`
  return story?.receipt?.credit
}

export const creditExplainer = (xpPerCredit = XP_PER_CREDIT) =>
  'Optio students earn XP for finished work instead of letter grades. A licensed teacher '
  + "reviews the evidence against the task's criteria and awards the XP. "
  + `${xpPerCredit.toLocaleString('en-US')} XP is one high school credit on an Optio Academy transcript.`

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
/**
 * Exclusion reasons a superadmin may override in either tier: the model
 * found nothing (no face, no name, no text, no identifying detail) and was
 * merely not confident, or would not commit. Mirrors
 * backend/services/stories/safety.py `overridable_in_any_tier`; the server
 * enforces it.
 */
const HUMAN_JUDGMENT_REASONS = new Set(['low_confidence', 'model_uncertain'])
const nonEmpty = (v) => Array.isArray(v) && v.some(x => x != null && String(x).trim())
export const overridableInAnyTier = (safety) => {
  if (!safety || !HUMAN_JUDGMENT_REASONS.has(safety.reason)) return false
  if (Number(safety.faces || 0) > 0) return false
  return !['names_person', 'names_place_or_team', 'identifying_detail', 'readable_text'].some(k => nonEmpty(safety[k]))
}

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
  // A kind the page no longer renders (how_it_went on an older row) sorts last.
  const rank = (s) => { const i = SECTION_ORDER.indexOf(s?.kind); return i === -1 ? SECTION_ORDER.length : i }
  const next = exists
    ? current.map(s => (s?.kind === kind ? { ...s, ...patch } : s))
    : [...current, { kind, ...patch }].sort((a, b) => rank(a) - rank(b))
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
        message: 'The hero is not one of this story\'s assets.',
      })
    } else if (!hero.included) {
      out.push({
        code: 'hero_excluded',
        field: 'hero_asset_id',
        message: 'The hero is excluded. Include it or pick another.',
      })
    } else if (hero.kind === 'document') {
      out.push({
        code: 'hero_is_document',
        field: 'hero_asset_id',
        message: 'The hero must be an image or a video, not a document.',
      })
    }
  }
  return out
}
