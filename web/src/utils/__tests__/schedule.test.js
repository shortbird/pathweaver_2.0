import { describe, it, expect } from 'vitest'
import {
  toMin, overlaps, conflictsWith, fitsAge, ageFromDob, fmtTime, weekGrid, DAY_ORDER,
} from '../schedule'

const m = (day, start, end, extra = {}) => ({ day_of_week: day, start_time: start, end_time: end, ...extra })

describe('toMin / fmtTime', () => {
  it('reads the HH:MM[:SS] strings class_meetings store', () => {
    expect(toMin('09:30')).toBe(570)
    expect(toMin('13:00:00')).toBe(780)
    expect(toMin(null)).toBeNull()
    expect(toMin('')).toBeNull()
    expect(toMin('noon')).toBeNull()
  })
  it('labels the way every schedule surface does', () => {
    expect(fmtTime('09:30')).toBe('9:30am')
    expect(fmtTime('13:00')).toBe('1pm')
    expect(fmtTime('')).toBe('')
  })
})

describe('overlaps / conflictsWith', () => {
  it('collides only on the same weekday with intersecting times', () => {
    expect(overlaps(m(2, '09:00', '10:00'), m(2, '09:30', '10:30'))).toBe(true)
    expect(overlaps(m(2, '09:00', '10:00'), m(2, '10:00', '11:00'))).toBe(false)
    expect(overlaps(m(2, '09:00', '10:00'), m(4, '09:00', '10:00'))).toBe(false)
    expect(overlaps(m(null, '09:00', '10:00', { specific_date: '2026-10-01' }), m(2, '09:00', '10:00'))).toBe(false)
    expect(overlaps(m(2, null, '10:00'), m(2, '09:00', '10:00'))).toBe(false)
  })
  it('names the clashing class', () => {
    const current = [{ name: 'Choir', meetings: [m(2, '09:00', '10:00')] }]
    expect(conflictsWith({ meetings: [m(2, '09:30', '10:30')] }, current)).toBe('Choir')
    expect(conflictsWith({ meetings: [m(3, '09:30', '10:30')] }, current)).toBeNull()
    expect(conflictsWith({ meetings: [] }, current)).toBeNull()
  })
})

describe('fitsAge / ageFromDob', () => {
  it('admits an unknown age and checks the band otherwise', () => {
    const band = { min_age: 5, max_age: 9 }
    expect(fitsAge(band, null)).toBe(true)
    expect(fitsAge(band, 5)).toBe(true)
    expect(fitsAge(band, 9)).toBe(true)
    expect(fitsAge(band, 10)).toBe(false)
    expect(fitsAge({ min_age: 12 }, 11)).toBe(false)
    expect(fitsAge({}, 40)).toBe(true)
  })
  it('judges age as of the first day of school when given one', () => {
    expect(ageFromDob('2017-08-25', '2026-08-24')).toBe(8)
    expect(ageFromDob('2017-08-24', '2026-08-24')).toBe(9)
    expect(ageFromDob(null, '2026-08-24')).toBeNull()
    expect(ageFromDob('2017-08-25', 'soon')).toBeNull()
  })
})

describe('weekGrid', () => {
  const CLASSES = [
    { id: 'a', name: 'All Day Studio', meetings: [m(1, '09:30', '15:00')] },
    { id: 'b', name: 'Choir', meetings: [m(2, '09:30', '10:30'), m(4, '09:30', '10:30')] },
    { id: 'c', name: 'Lego Lab', meetings: [m(2, '13:00', '14:00')] },
    { id: 'd', name: 'Field Trip', meetings: [m(6, '08:00', '12:00', { specific_date: '2026-10-03' })] },
    { id: 'e', name: 'Untimed', meetings: [] },
  ]

  it('keys rows on the start time across the whole week (iCreate 2026-08-25)', () => {
    const g = weekGrid(CLASSES)
    expect(g.slots).toEqual(['08:00', '09:30', '13:00'])
    expect(g.days).toEqual([1, 2, 4, 6])
    expect(g.cell['1|09:30'].map((x) => x.cls.name)).toEqual(['All Day Studio'])
    expect(g.cell['2|09:30'].map((x) => x.cls.name)).toEqual(['Choir'])
    expect([...g.endsBySlot['09:30']].sort()).toEqual(['10:30', '15:00'])
  })

  it('reports a class still running through a later row (iCreate 32b2beb3)', () => {
    const g = weekGrid(CLASSES)
    expect(g.covering(1, '13:00').map((c) => c.name)).toEqual(['All Day Studio'])
    expect(g.covering(2, '13:00')).toEqual([])
    expect(g.covering(1, '09:30')).toEqual([])
  })

  it('lists the classes with no weekly meeting and can leave dated one-offs out', () => {
    expect(weekGrid(CLASSES).unscheduled.map((c) => c.name)).toEqual(['Untimed'])
    const teacher = weekGrid(CLASSES, { recurringOnly: true })
    expect(teacher.slots).toEqual(['09:30', '13:00'])
    expect(teacher.unscheduled.map((c) => c.name)).toEqual(['Field Trip', 'Untimed'])
  })

  it('orders the week Monday first', () => {
    expect(DAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(weekGrid([{ name: 'x', meetings: [m(0, '09:00', '10:00'), m(1, '09:00', '10:00')] }]).days).toEqual([1, 0])
  })
})
