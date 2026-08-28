import { describe, it, expect } from 'vitest'
import { matchesPersonSearch, searchableNames } from './personSearch'

/**
 * A student on file as Monroe and known as Montie renders as "Montie Adams"
 * everywhere, because the preferred name replaces the first. Searching the
 * rendered string alone made the legal name unfindable — the office types what
 * is on the enrollment form and the roster comes back empty (iCreate,
 * 2026-08-28).
 */
describe('matchesPersonSearch', () => {
  const student = {
    name: 'Montie Adams',
    first_name: 'Monroe',
    last_name: 'Adams',
    preferred_name: 'Montie',
  }

  it('finds them by the name on screen', () => {
    expect(matchesPersonSearch(student, 'montie')).toBe(true)
  })

  it('finds them by the name on their paperwork', () => {
    expect(matchesPersonSearch(student, 'monroe')).toBe(true)
  })

  it('finds them by full legal name', () => {
    expect(matchesPersonSearch(student, 'monroe adams')).toBe(true)
  })

  it('is case-insensitive and trims', () => {
    expect(matchesPersonSearch(student, '  MONROE  ')).toBe(true)
  })

  it('still says no to somebody else', () => {
    expect(matchesPersonSearch(student, 'zylberstein')).toBe(false)
  })

  it('an empty query matches everyone', () => {
    expect(matchesPersonSearch(student, '')).toBe(true)
    expect(matchesPersonSearch(student, '   ')).toBe(true)
  })

  it('handles a member carrying only the rendered name plus search_terms', () => {
    const member = { name: 'Montie Adams', search_terms: 'Monroe Adams Montie' }
    expect(matchesPersonSearch(member, 'monroe')).toBe(true)
  })

  it('does not blow up on a missing person', () => {
    expect(matchesPersonSearch(null, 'x')).toBe(false)
    expect(searchableNames(null)).toEqual([])
  })

  it('drops empty name parts rather than matching on whitespace', () => {
    expect(searchableNames({ name: 'Gina', first_name: '', last_name: null }))
      .toEqual(['gina'])
  })
})
