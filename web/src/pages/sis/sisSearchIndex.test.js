import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildSearchIndex, searchFeatures, SUB_ENTRIES } from './sisSearchIndex'
import { navContextFor } from './sisNavVisibility'
import { NAV_SECTIONS } from '../../components/sis/SisSidebar'
import { SETTINGS_CARDS } from '../../settings/settingsRegistry'
import { getPreviewTeacher } from './teacherPreview'

// Hoisted above the imports by vitest.
vi.mock('./teacherPreview', () => ({ getPreviewTeacher: vi.fn(() => null) }))

const orgAdmin = { id: 'u1', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] }
const coordinator = { id: 'u2', role: 'org_managed', org_role: 'campus_coordinator', org_roles: ['campus_coordinator'] }
const teacher = { id: 'u3', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'] }

// A SIS org with every opt-in on and nothing hidden (sis_enabled is the
// parent every console module cascades from).
const fullOrg = {
  id: 'org-1',
  feature_flags: {
    sis_enabled: true,
    sis_settings: { community_enabled: true, prior_learning_enabled: true, clp_enabled: true, post_registration_flow: 'goals' },
  },
}

const names = (index) => index.map((e) => e.name)
const ids = (index) => index.map((e) => e.id)

beforeEach(() => { getPreviewTeacher.mockReturnValue(null) })

describe('buildSearchIndex', () => {
  it('lists every sidebar page an admin has, then what sits under each', () => {
    const index = buildSearchIndex(navContextFor(orgAdmin, fullOrg))
    const pages = NAV_SECTIONS.flatMap((s) => s.items).filter((i) => !i.teacherOnly)
    pages.forEach((p) => expect(ids(index)).toContain(p.path))
    // A tab sits right after its page, in nav order.
    const messaging = ids(index).indexOf('/inbox')
    expect(index[messaging + 1]).toMatchObject({ name: 'Announcements', to: '/inbox?tab=announcements', hint: 'Messaging · Operations', parent: 'Messaging' })
  })

  it('offers a teacher only what the sidebar offers a teacher', () => {
    const index = buildSearchIndex(navContextFor(teacher, fullOrg))
    // Their own console.
    expect(names(index)).toEqual(expect.arrayContaining(['Directory', 'Classes', 'My classes', 'Announcements', 'My messages', 'My tasks', 'Library', 'Documents', 'Training']))
    // Not the office's.
    expect(names(index)).not.toContain('People')
    expect(names(index)).not.toContain('Curriculum')
    expect(names(index)).not.toContain('Quests')
    expect(names(index)).not.toContain('Billing')
    expect(names(index)).not.toContain('Attendance')
    expect(names(index)).not.toContain('Class catalog')
    expect(names(index)).not.toContain('School inbox')
    expect(names(index)).not.toContain('Requests')
    expect(names(index)).not.toContain('Settings')
    expect(index.some((e) => e.to.startsWith('/reports'))).toBe(false)
  })

  it('gives a campus coordinator the console without the money or the HR store', () => {
    const index = buildSearchIndex(navContextFor(coordinator, fullOrg))
    expect(names(index)).toEqual(expect.arrayContaining(['People', 'Attendance', 'Registration', 'Reports', 'Medications']))
    expect(names(index)).not.toContain('Billing')
    expect(names(index)).not.toContain('Tuition')
    expect(names(index)).not.toContain('Payments')
    expect(names(index)).not.toContain('Secure documents')
    // The org identity card is finance-tier (settingsRegistry minTier).
    expect(names(index)).not.toContain('Organization')
    expect(names(index)).toContain('Classrooms and rooms')
  })

  it('drops a page and its tabs when the org turned the module off', () => {
    const org = { ...fullOrg, feature_flags: { ...fullOrg.feature_flags, sis_settings: { ...fullOrg.feature_flags.sis_settings, hidden_modules: ['attendance', 'calendar'] } } }
    const index = buildSearchIndex(navContextFor(orgAdmin, org))
    expect(names(index)).toContain('Classes')
    expect(names(index)).not.toContain('Attendance')
    expect(names(index)).not.toContain('Calendar')
    expect(names(index)).not.toContain('Calendar categories')
  })

  it('keeps the opt-ins out until the org opts in', () => {
    const index = buildSearchIndex(navContextFor(orgAdmin, { id: 'org-2', feature_flags: { sis_enabled: true, sis_settings: {} } }))
    expect(names(index)).not.toContain('Community')
    expect(names(index)).not.toContain('Lost and found')
    expect(names(index)).not.toContain('CLP')
    expect(names(index)).not.toContain('Prior Learning')
    expect(names(index)).not.toContain('Goals')
  })

  it('offers the teacher console while an admin previews a teacher', () => {
    getPreviewTeacher.mockReturnValue({ id: 't1', name: 'Ana Rogers' })
    const index = buildSearchIndex(navContextFor(orgAdmin, fullOrg))
    expect(names(index)).toContain('My documents')
    expect(names(index)).not.toContain('People')
    expect(names(index)).not.toContain('Billing')
  })

  it('has an entry for every console settings card', () => {
    const consoleCards = SETTINGS_CARDS.filter((c) => c.surfaces.includes('console')).map((c) => c.key)
    const anchored = SUB_ENTRIES.filter((e) => e.under === '/settings').map((e) => e.to.replace('/settings#settings-', ''))
    expect(anchored.sort()).toEqual(consoleCards.sort())
  })

  it('points every destination at a registered SIS route', () => {
    // A tab moves, a page merges, and the search would offer a link that
    // bounces to the dashboard. SisRoutes.jsx is the source of truth.
    const here = path.dirname(fileURLToPath(import.meta.url))
    const src = fs.readFileSync(path.join(here, '../../sis/SisRoutes.jsx'), 'utf8')
    const routed = new Set([...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => `/${m[1]}`))
    routed.add('/') // the index route
    const pathnames = new Set([
      ...NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.path)),
      ...SUB_ENTRIES.map((e) => e.to.split(/[?#]/)[0]),
    ])
    pathnames.forEach((p) => expect(routed, `${p} is in the search index but not in SisRoutes`).toContain(p))
  })

  it('gives every entry its own id, whatever its URL', () => {
    // A default tab shares its page's URL (My tasks is /tasks, Documents is
    // /library); the id is what React keys the list on, so it cannot be the URL.
    const index = buildSearchIndex(navContextFor(orgAdmin, fullOrg))
    const seen = new Set()
    index.forEach((e) => {
      expect(seen.has(e.id), `${e.id} appears twice`).toBe(false)
      seen.add(e.id)
    })
    expect(index.filter((e) => e.to === '/tasks')).toHaveLength(2)
    expect(index.filter((e) => e.to === '/library')).toHaveLength(2)
  })

  it('every entry sits under a page the sidebar has', () => {
    const pages = new Set(NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.path)))
    SUB_ENTRIES.forEach((e) => expect(pages, `${e.name} is under ${e.under}, which is not a nav page`).toContain(e.under))
  })
})

describe('searchFeatures', () => {
  const index = buildSearchIndex(navContextFor(orgAdmin, fullOrg))

  it('returns nothing for an empty query', () => {
    expect(searchFeatures(index, '')).toEqual([])
    expect(searchFeatures(index, '   ')).toEqual([])
  })

  it('finds the Messaging tab for "announcements"', () => {
    const [first, second] = searchFeatures(index, 'announcements')
    expect(first.to).toBe('/inbox?tab=announcements')
    // The community board's announcements are there too, behind the exact hit.
    expect(second.to).toBe('/community?tab=announcements')
  })

  it('ranks a name that starts with the query over one that merely contains it', () => {
    const results = searchFeatures(index, 'class')
    expect(results[0].name).toBe('Classes')
    expect(results.map((r) => r.name)).toContain('My classes')
    expect(results.map((r) => r.name).indexOf('Classes')).toBeLessThan(results.map((r) => r.name).indexOf('My classes'))
  })

  it('matches on what people call a thing, not only the nav word', () => {
    expect(searchFeatures(index, 'invoices')[0].name).toBe('Billing')
    expect(searchFeatures(index, 'roll call')[0].name).toBe('Attendance')
    expect(searchFeatures(index, 'rooms')[0].to).toBe('/settings#settings-rooms')
    expect(searchFeatures(index, 'medications')[0].to).toBe('/reports?report=medications')
    expect(searchFeatures(index, 'lost & found')[0].to).toBe('/community?tab=lost-found')
    // The four library pages are tabs since M22; their old names still land.
    expect(searchFeatures(index, 'resources')[0].to).toBe('/library')
    expect(searchFeatures(index, 'handbook')[0].to).toBe('/library')
    expect(searchFeatures(index, 'training')[0].to).toBe('/library?tab=training')
    expect(searchFeatures(index, 'curriculum')[0].to).toBe('/library?tab=curriculum')
    expect(searchFeatures(index, 'quests')[0].to).toBe('/library?tab=quests')
  })

  it('needs every typed word to match somewhere', () => {
    const results = searchFeatures(index, 'student family')
    expect(results.map((r) => r.name)).toContain('Students without a family')
    expect(results.map((r) => r.name)).not.toContain('Billing')
    expect(searchFeatures(index, 'zzz nothing')).toEqual([])
  })

  it('caps the list', () => {
    expect(searchFeatures(index, 'a', 5)).toHaveLength(5)
    expect(searchFeatures(index, 'e').length).toBeLessThanOrEqual(8)
  })
})
