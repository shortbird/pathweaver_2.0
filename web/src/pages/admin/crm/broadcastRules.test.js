import { describe, it, expect } from 'vitest'
import { columnKey, computeAmount, rowAmount, nextMonth, sheetPayload, schoolsOf, isReservedKey } from './broadcastRules'

describe('broadcastRules', () => {
  it('turns a column label into a variable name', () => {
    expect(columnKey('Late fee ($)')).toBe('late_fee')
    expect(columnKey('  2nd term ')).toBe('nd_term')
    expect(columnKey('$$$')).toBe('')
    expect(isReservedKey('amount_due')).toBe(true)
  })

  it('multiplies students by price, and keeps a typed amount', () => {
    expect(computeAmount('40', '$25')).toBe('1000.00')
    expect(computeAmount('3', '19.99')).toBe('59.97')
    expect(computeAmount('', '25')).toBe('')
    expect(computeAmount('40', 'TBD')).toBe('')
    expect(rowAmount({ student_count: '4', price_per_student: '10', amount_due: '35', amount_edited: false })).toBe('40.00')
    expect(rowAmount({ student_count: '4', price_per_student: '10', amount_due: '35', amount_edited: true })).toBe('35')
  })

  it('defaults the billing month to next month, across a year end', () => {
    expect(nextMonth(new Date(2026, 9, 12))).toBe('2026-11')
    expect(nextMonth(new Date(2026, 11, 31))).toBe('2027-01')
  })

  it('sends the amount the sheet shows, and every custom column', () => {
    const payload = sheetPayload({
      month: '2026-11',
      columns: [{ key: 'due_date', label: 'Due date' }],
      rows: { 'org-a': { student_count: '2', price_per_student: '25', amount_due: '', amount_edited: false, billing_note: '', due_date: 'Nov 5' } },
    })
    expect(payload.schools['org-a']).toEqual({
      student_count: '2',
      price_per_student: '25',
      amount_due: '50.00',
      billing_note: '',
      due_date: 'Nov 5',
    })
  })

  it('lists each school on the list once, by name', () => {
    const people = [{ organization_id: 'b' }, { organization_id: null }, { organization_id: 'a' }, { organization_id: 'b' }]
    expect(schoolsOf(people, { a: 'Zion', b: 'Apogee' })).toEqual(['b', 'a'])
  })
})
