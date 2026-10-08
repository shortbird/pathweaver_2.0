/**
 * Who is on an email list. Pure functions over the /api/admin/crm/directory
 * rows, so the page and its saved lists resolve the same way and the rules
 * can be tested without a browser.
 *
 * A list is a filter plus hand edits:
 *   filters      { roles: [], org_ids: [], class_ids: [], include_test, include_suppressed }
 *   include_ids  people added by hand, whatever the filter says
 *   exclude_ids  people the filter catches who should not get this email
 *
 * An empty filter matches nobody. Copying "everyone on Optio" by accident is
 * the mistake this page must make hard.
 */

export const ROLE_OPTIONS = [
  { id: 'org_admin', label: 'Org admins' },
  { id: 'parent', label: 'Parents' },
  { id: 'student', label: 'Students' },
  { id: 'advisor', label: 'Advisors' },
  { id: 'campus_coordinator', label: 'Campus coordinators' },
  { id: 'observer', label: 'Observers' },
  { id: 'superadmin', label: 'Superadmins' },
]

// Platform users (no organization) are picked with this id in org_ids.
export const NO_ORG = 'none'

// Gmail refuses a message to more than 500 external recipients.
export const GMAIL_BATCH = 500

export const emptyFilters = () => ({
  roles: [],
  org_ids: [],
  class_ids: [],
  include_test: false,
  include_suppressed: false,
})

export const normalizeFilters = (filters) => ({ ...emptyFilters(), ...(filters || {}) })

/** Seeded and demo accounts: reserved test TLDs, or "test" as a domain label. */
export const isTestEmail = (email) => {
  const domain = (email || '').toLowerCase().split('@')[1] || ''
  return /\.(example|test|invalid|localhost)$/.test(domain) || /(^|[.-])test([.-]|$)/.test(domain)
}

const hasFilter = (f) => f.roles.length > 0 || f.org_ids.length > 0 || f.class_ids.length > 0

export const matchesFilters = (person, filters) => {
  const f = normalizeFilters(filters)
  if (!hasFilter(f)) return false
  if (f.roles.length && !f.roles.some((r) => person.roles.includes(r))) return false
  if (f.org_ids.length && !f.org_ids.includes(person.organization_id || NO_ORG)) return false
  if (f.class_ids.length) {
    // A student's own classes, or a guardian's children's.
    const mine = [...(person.class_ids || []), ...(person.child_class_ids || [])]
    if (!f.class_ids.some((c) => mine.includes(c))) return false
  }
  return true
}

/**
 * The recipients of a list, and why anyone the filter caught was left out.
 * Hand-added people skip the test-account rule (you added them on purpose)
 * but not suppression or deletion: someone who unsubscribed stays out unless
 * include_suppressed is on.
 */
export const resolveList = (people, list) => {
  const filters = normalizeFilters(list?.filters)
  const include = new Set(list?.include_ids || [])
  const exclude = new Set(list?.exclude_ids || [])
  const recipients = []
  const leftOut = { excluded: [], suppressed: [], test: [], deleting: [] }
  const seen = new Set()

  for (const person of people) {
    const added = include.has(person.id)
    if (!added && !matchesFilters(person, filters)) continue
    if (exclude.has(person.id)) {
      leftOut.excluded.push(person)
      continue
    }
    if (person.deleting) {
      leftOut.deleting.push(person)
      continue
    }
    if (person.suppressed && !filters.include_suppressed) {
      leftOut.suppressed.push(person)
      continue
    }
    if (!added && !filters.include_test && isTestEmail(person.email)) {
      leftOut.test.push(person)
      continue
    }
    const key = person.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    recipients.push(person)
  }
  return { recipients, leftOut }
}

/** "a@x.com, b@y.com" -- pastes into Gmail's BCC field as separate chips. */
export const emailString = (people) => people.map((p) => p.email).join(', ')

export const batches = (items, size = GMAIL_BATCH) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Built-in starting points. Each opens as an unsaved list. */
export const presets = (organizations) => {
  const academy = organizations.find((o) => o.name === 'Optio Academy')
  const out = [{ id: 'org_admins', label: 'All org admins', filters: { ...emptyFilters(), roles: ['org_admin'] } }]
  if (academy) {
    out.push({
      id: 'academy_parents',
      label: 'All Optio Academy parents',
      filters: { ...emptyFilters(), roles: ['parent'], org_ids: [academy.id] },
    })
  }
  out.push({ id: 'platform_parents', label: 'Parents with no school', filters: { ...emptyFilters(), roles: ['parent'], org_ids: [NO_ORG] } })
  return out
}
