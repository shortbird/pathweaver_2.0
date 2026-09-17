import { describe, it, expect } from 'vitest'
import {
  applyFilters, sortRows, roleChipOptions, statusOptions, familyOptions,
  isFormer, statusOf, EMPTY_FILTERS,
} from './peopleFilters'

/**
 * The one People table's filters, without a DOM.
 *
 * Former is a person the school is not running the day for any more: a
 * withdrawn or graduated student, a guardian whose every child has left, an
 * archived staff member. "Why are we keeping families and their numbers if
 * they aren't part of the school anymore?" (iCreate, 2026-09-14).
 */

const row = (id, over = {}) => ({
  student_id: id, name: id, is_student: false, roles: ['parent'], role: 'parent',
  enrollment_status: null, household_id: null, household_name: null,
  joined_at: '2026-06-01T00:00:00Z', last_active: null, age: null, ...over,
})

const ROWS = [
  row('Ada', { is_student: true, roles: ['student'], enrollment_status: 'enrolled', household_id: 'h1', household_name: 'Ant', age: 9 }),
  row('Bo', { is_student: true, roles: ['student'], enrollment_status: 'withdrawn', household_id: 'h2', household_name: 'Bee', household_former: true, age: 12 }),
  row('Bea', { roles: ['parent'], household_id: 'h2', household_name: 'Bee', household_former: true, stated_payment_methods: ['Utah Fits All'] }),
  row('Cal', { is_student: true, roles: ['student'], enrollment_status: 'unassigned', age: 7 }),
  row('Molly', { roles: ['org_admin', 'parent'], household_id: 'h1', household_name: 'Ant', last_active: '2026-09-01T00:00:00Z', registration_hold: true }),
  row('Julia', { roles: ['advisor'], login_pending: true, email: 'julia@x.com' }),
  row('Liz', { roles: ['advisor'], is_placeholder: true, class_count: 3 }),
  row('Old', { roles: ['advisor'], archived: true }),
]
const names = (rows) => rows.map((r) => r.name)

describe('former', () => {
  it('is a withdrawn student, a guardian whose children all left, or archived staff', () => {
    expect(names(ROWS.filter(isFormer))).toEqual(['Bo', 'Bea', 'Old'])
  })

  it('is hidden by default and shown on request', () => {
    expect(names(applyFilters(ROWS, EMPTY_FILTERS))).toEqual(['Ada', 'Cal', 'Molly', 'Julia', 'Liz'])
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, showFormer: true }))).toHaveLength(8)
  })

  it('a status filter that asks for the former shows them without the toggle', () => {
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, status: 'withdrawn' }))).toEqual(['Bo'])
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, status: 'archived' }))).toEqual(['Old'])
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, family: 'former' }))).toEqual(['Bo', 'Bea'])
  })
})

describe('status', () => {
  it('is the one word a row carries', () => {
    expect(statusOf(ROWS[0])).toBeNull()
    expect(statusOf(ROWS[1])).toBe('withdrawn')
    expect(statusOf(ROWS[3])).toBe('not_enrolled')
    expect(statusOf(ROWS[5])).toBe('invite_pending')
    expect(statusOf(ROWS[6])).toBe('no_login')
    expect(statusOf(ROWS[7])).toBe('archived')
  })

  it('offers only the statuses somebody has, with counts', () => {
    expect(statusOptions(ROWS, EMPTY_FILTERS).map((o) => `${o.key}:${o.count}`)).toEqual([
      'not_enrolled:1', 'invite_pending:1', 'no_login:1', 'hold:1', 'withdrawn:1', 'archived:1',
    ])
  })

  it('a registration hold is a status too', () => {
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, status: 'hold' }))).toEqual(['Molly'])
  })
})

describe('roles', () => {
  it('always offers Students, Parents and Teachers; the rarer roles only when held', () => {
    expect(roleChipOptions(ROWS, EMPTY_FILTERS).map((o) => `${o.key}:${o.count}`)).toEqual([
      'student:2', 'parent:1', 'advisor:2', 'org_admin:1',
    ])
    expect(roleChipOptions(ROWS, { ...EMPTY_FILTERS, showFormer: true }).map((o) => `${o.key}:${o.count}`)).toEqual([
      'student:3', 'parent:2', 'advisor:3', 'org_admin:1',
    ])
    // A status only students have: the main three stay, Admins goes.
    expect(roleChipOptions(ROWS, { ...EMPTY_FILTERS, status: 'not_enrolled' }).map((o) => `${o.key}:${o.count}`)).toEqual([
      'student:1', 'parent:0', 'advisor:0',
    ])
  })

  it('a person with two roles is found under either', () => {
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, role: 'parent' }))).toEqual(['Molly'])
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, role: 'org_admin' }))).toEqual(['Molly'])
  })

  it('staff is every staff role at once', () => {
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, role: 'staff' }))).toEqual(['Molly', 'Julia', 'Liz'])
  })
})

describe('family', () => {
  it('not in a family counts students and parents, never teachers', () => {
    expect(familyOptions(ROWS, EMPTY_FILTERS).map((o) => `${o.key}:${o.count}`)).toEqual([
      'in:2', 'none:1', 'former:2',
    ])
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, family: 'none' }))).toEqual(['Cal'])
  })

  it('how the family pays is a filter on its members', () => {
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, pay: 'Utah Fits All', showFormer: true }))).toEqual(['Bea'])
  })
})

describe('search', () => {
  it('finds a person by family name, email or any name they go by', () => {
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, q: 'ant' }))).toEqual(['Ada', 'Molly'])
    expect(names(applyFilters(ROWS, { ...EMPTY_FILTERS, q: 'julia@' }))).toEqual(['Julia'])
  })
})

describe('sort', () => {
  it('by role puts the most privileged first, ties by name', () => {
    const sorted = sortRows(applyFilters(ROWS, EMPTY_FILTERS), { key: 'role', dir: 'asc' })
    expect(names(sorted)).toEqual(['Molly', 'Julia', 'Liz', 'Ada', 'Cal'])
  })

  it('by age puts people without one last either way', () => {
    const rows = applyFilters(ROWS, EMPTY_FILTERS)
    expect(names(sortRows(rows, { key: 'age', dir: 'asc' }))).toEqual(['Cal', 'Ada', 'Julia', 'Liz', 'Molly'])
    expect(names(sortRows(rows, { key: 'age', dir: 'desc' }))).toEqual(['Ada', 'Cal', 'Julia', 'Liz', 'Molly'])
  })
})
