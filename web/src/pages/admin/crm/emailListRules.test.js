import { describe, it, expect } from 'vitest'
import { resolveList, matchesFilters, isTestEmail, emailString, batches, presets, emptyFilters, NO_ORG } from './emailListRules'

const ACADEMY = 'org-academy'
const OTHER = 'org-other'

const person = (id, overrides = {}) => ({
  id,
  name: id,
  email: `${id}@gmail.com`,
  roles: ['parent'],
  organization_id: ACADEMY,
  class_ids: [],
  child_class_ids: [],
  children: [],
  suppressed: false,
  deleting: false,
  ...overrides,
})

const PEOPLE = [
  person('ana', { child_class_ids: ['robotics'] }),
  person('ben', { child_class_ids: ['art'] }),
  person('cal', { roles: ['org_admin', 'parent'], organization_id: OTHER }),
  person('dee', { roles: ['student'], class_ids: ['robotics'] }),
  person('eve', { roles: ['parent'], organization_id: null }),
  person('fay', { email: 'fay@testorg.example' }),
  person('gus', { suppressed: true }),
  person('hal', { deleting: true }),
]

const ids = (list) => list.map((p) => p.id)
const filters = (patch) => ({ ...emptyFilters(), ...patch })

describe('email list rules', () => {
  it('matches nobody until a filter is chosen', () => {
    expect(resolveList(PEOPLE, { filters: emptyFilters() }).recipients).toEqual([])
  })

  it('all Optio Academy parents, without test, unsubscribed or deleting accounts', () => {
    const { recipients, leftOut } = resolveList(PEOPLE, { filters: filters({ roles: ['parent'], org_ids: [ACADEMY] }) })
    expect(ids(recipients)).toEqual(['ana', 'ben'])
    expect(ids(leftOut.test)).toEqual(['fay'])
    expect(ids(leftOut.suppressed)).toEqual(['gus'])
    expect(ids(leftOut.deleting)).toEqual(['hal'])
  })

  it('all org admins across schools', () => {
    expect(ids(resolveList(PEOPLE, { filters: filters({ roles: ['org_admin'] }) }).recipients)).toEqual(['cal'])
  })

  it('a class reaches its students and the parents of its students', () => {
    const { recipients } = resolveList(PEOPLE, { filters: filters({ org_ids: [ACADEMY], class_ids: ['robotics'] }) })
    expect(ids(recipients)).toEqual(['ana', 'dee'])
  })

  it('platform users are picked with the no-school option', () => {
    expect(matchesFilters(PEOPLE[4], filters({ org_ids: [NO_ORG] }))).toBe(true)
    expect(matchesFilters(PEOPLE[0], filters({ org_ids: [NO_ORG] }))).toBe(false)
  })

  it('hand edits sit on top of the filter', () => {
    const { recipients, leftOut } = resolveList(PEOPLE, {
      filters: filters({ roles: ['parent'], org_ids: [ACADEMY] }),
      include_ids: ['cal', 'fay'],
      exclude_ids: ['ben'],
    })
    // fay is a test account, but she was added on purpose.
    expect(ids(recipients)).toEqual(['ana', 'cal', 'fay'])
    expect(ids(leftOut.excluded)).toEqual(['ben'])
  })

  it('an unsubscribed person stays out even when added by hand, unless the list says otherwise', () => {
    expect(ids(resolveList(PEOPLE, { filters: emptyFilters(), include_ids: ['gus'] }).recipients)).toEqual([])
    expect(
      ids(resolveList(PEOPLE, { filters: filters({ include_suppressed: true }), include_ids: ['gus'] }).recipients)
    ).toEqual(['gus'])
  })

  it('one address appears once', () => {
    const twins = [person('a1', { email: 'Same@x.com' }), person('a2', { email: 'same@x.com' })]
    expect(resolveList(twins, { filters: filters({ roles: ['parent'] }) }).recipients).toHaveLength(1)
  })

  it('recognises seeded test domains and leaves real ones alone', () => {
    expect(isTestEmail('a@testorg.example')).toBe(true)
    expect(isTestEmail('a@hearthwood-test.optioeducation.com')).toBe(true)
    expect(isTestEmail('a@gmail.com')).toBe(false)
    expect(isTestEmail('a@contestants.org')).toBe(false)
  })

  it('copies a comma list and splits past the Gmail cap', () => {
    expect(emailString([PEOPLE[0], PEOPLE[1]])).toBe('ana@gmail.com, ben@gmail.com')
    expect(batches(Array.from({ length: 1001 }, (_, i) => i)).map((b) => b.length)).toEqual([500, 500, 1])
  })

  it('offers the Academy preset only when the org exists', () => {
    expect(presets([]).map((p) => p.id)).not.toContain('academy_parents')
    const academy = presets([{ id: ACADEMY, name: 'Optio Academy' }]).find((p) => p.id === 'academy_parents')
    expect(academy.filters.org_ids).toEqual([ACADEMY])
  })
})
