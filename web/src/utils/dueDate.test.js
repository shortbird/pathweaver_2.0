import { describe, it, expect } from 'vitest'
import { dueStatus, dueChipClasses } from './dueDate'

// Fixed "now" so these never drift. Local noon, so a same-day due date at
// 23:59 is still ahead and one at 06:00 is already behind.
const NOW = new Date(2026, 8, 10, 12, 0, 0) // 10 Sep 2026, 12:00 local

describe('dueStatus', () => {
  it('returns null when there is no due date', () => {
    // The common case: a quest the student picked for themselves. The caller
    // renders nothing rather than an empty chip.
    expect(dueStatus(null, NOW)).toBeNull()
    expect(dueStatus(undefined, NOW)).toBeNull()
    expect(dueStatus('', NOW)).toBeNull()
  })

  it('returns null for a date it cannot read, rather than NaN', () => {
    expect(dueStatus('not a date', NOW)).toBeNull()
  })

  it('calls a past date overdue', () => {
    const status = dueStatus(new Date(2026, 8, 3, 12, 0).toISOString(), NOW)
    expect(status.overdue).toBe(true)
    expect(status.label).toContain('Overdue')
  })

  it('names yesterday rather than printing its date', () => {
    const status = dueStatus(new Date(2026, 8, 9, 12, 0).toISOString(), NOW)
    expect(status.overdue).toBe(true)
    expect(status.label).toBe('Was due yesterday')
  })

  it('says "Due today" for later the same day', () => {
    const status = dueStatus(new Date(2026, 8, 10, 23, 59).toISOString(), NOW)
    expect(status.dueToday).toBe(true)
    expect(status.overdue).toBe(false)
    expect(status.label).toBe('Due today')
  })

  it('still says "Due today" for earlier the same day', () => {
    // Gryffin stores end-of-day deadlines as 05:59:59 UTC, which lands in the
    // morning for some viewers. Telling a student their work is "Overdue ·
    // Sep 10" at lunchtime on Sep 10 reads as a week late.
    const status = dueStatus(new Date(2026, 8, 10, 6, 0).toISOString(), NOW)
    expect(status.overdue).toBe(true)
    expect(status.label).toBe('Due today')
  })

  it('says "Due tomorrow"', () => {
    const status = dueStatus(new Date(2026, 8, 11, 9, 0).toISOString(), NOW)
    expect(status.label).toBe('Due tomorrow')
    expect(status.dueSoon).toBe(true)
  })

  it('prints a date once it is far enough out', () => {
    const status = dueStatus(new Date(2026, 8, 24, 9, 0).toISOString(), NOW)
    expect(status.label).toBe('Due Sep 24')
    expect(status.dueSoon).toBe(false)
  })

  it('counts calendar days, not 24-hour blocks', () => {
    // 23:00 tonight and 01:00 tomorrow are two hours apart but different days.
    expect(dueStatus(new Date(2026, 8, 10, 23, 0).toISOString(), NOW).daysAway).toBe(0)
    expect(dueStatus(new Date(2026, 8, 11, 1, 0).toISOString(), NOW).daysAway).toBe(1)
  })
})

describe('dueChipClasses', () => {
  it('gives overdue work its own colour', () => {
    const overdue = dueStatus(new Date(2026, 8, 1).toISOString(), NOW)
    const later = dueStatus(new Date(2026, 8, 30).toISOString(), NOW)
    expect(dueChipClasses(overdue)).toContain('red')
    expect(dueChipClasses(overdue)).not.toBe(dueChipClasses(later))
  })

  it('returns nothing for no status, so a chip cannot render empty', () => {
    expect(dueChipClasses(null)).toBe('')
  })
})
