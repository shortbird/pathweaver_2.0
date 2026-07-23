import { describe, it, expect } from 'vitest'
import { mergeAutofilledFields, firstQuestionError } from './ICreateRegisterPage'

/**
 * Regression: browser/password-manager autofill paints values into the address
 * inputs without firing React's onChange, so state stays '' while the parent
 * SEES a filled-in address — and submit loops on "add an address" forever
 * (reported by an iCreate parent, 2026-07-09). Before validating, the family
 * step now trusts the DOM for any state-empty field.
 */

const NAMES = {
  phone: 'phone', address_line1: 'address-line1', address_line2: 'address-line2',
  city: 'city', state: 'state', postal_code: 'zip',
}

const containerWith = (values) => {
  const box = document.createElement('div')
  for (const [name, value] of Object.entries(values)) {
    const input = document.createElement('input')
    input.name = name
    input.value = value
    box.appendChild(input)
  }
  return box
}

describe('mergeAutofilledFields', () => {
  it('recovers autofilled values React state never saw', () => {
    const state = { phone: '', address_line1: '', address_line2: '', city: '', state: '', postal_code: '' }
    const box = containerWith({
      phone: '801-555-0100', 'address-line1': '123 Maple St',
      city: 'Lehi', state: 'UT', zip: '84043',
    })
    const merged = mergeAutofilledFields(state, box, NAMES)
    expect(merged.address_line1).toBe('123 Maple St')
    expect(merged.city).toBe('Lehi')
    expect(merged.state).toBe('UT')
    expect(merged.postal_code).toBe('84043')
    expect(merged.phone).toBe('801-555-0100')
    expect(merged.address_line2).toBe('') // not autofilled, stays empty
  })

  it('never overwrites values the user actually typed', () => {
    const state = { address_line1: '456 Oak Ave', city: '' }
    const box = containerWith({ 'address-line1': 'stale autofill', city: 'Provo' })
    const merged = mergeAutofilledFields(state, box, { address_line1: 'address-line1', city: 'city' })
    expect(merged.address_line1).toBe('456 Oak Ave')
    expect(merged.city).toBe('Provo')
  })

  it('is a no-op without a container or matching inputs', () => {
    const state = { city: '' }
    expect(mergeAutofilledFields(state, null, { city: 'city' })).toBe(state)
    const merged = mergeAutofilledFields(state, containerWith({}), { city: 'city' })
    expect(merged.city).toBe('')
  })
})

/**
 * Registration-question validation on the details step. Family-level questions
 * hold one value; per_student questions hold {kidUserId: value} and every kid
 * must answer required ones (added for the Gryffin funnel).
 */
describe('firstQuestionError', () => {
  const kids = [
    { user_id: 'k1', first_name: 'Ana' },
    { user_id: 'k2', first_name: 'Ben' },
  ]
  const questions = [
    { key: 'consent', label: 'Media consent', type: 'select', required: true },
    { key: 'direction', label: 'Direction for the year', type: 'text', required: true, per_student: true },
    { key: 'interests', label: 'Interests', type: 'multi', per_student: true },
  ]

  it('passes when family and per-student answers are complete', () => {
    const answers = {
      consent: 'Yes',
      direction: { k1: 'Learn to weld', k2: 'Ship a game' },
      interests: { k1: ['Art'] }, // optional — Ben may skip it
    }
    expect(firstQuestionError(questions, answers, kids)).toBeNull()
  })

  it('names the kid missing a required per-student answer', () => {
    const answers = { consent: 'Yes', direction: { k1: 'Learn to weld' } }
    expect(firstQuestionError(questions, answers, kids))
      .toBe('Please answer for Ben: Direction for the year')
  })

  it('keeps the family-level message unchanged', () => {
    expect(firstQuestionError(questions, {}, kids)).toBe('Please answer: Media consent')
  })

  it('treats empty multi selections as unanswered when required', () => {
    const qs = [{ key: 'days', label: 'Days on campus', type: 'multi', required: true, per_student: true }]
    expect(firstQuestionError(qs, { days: { k1: ['Tue'], k2: [] } }, kids))
      .toBe('Please answer for Ben: Days on campus')
  })

  it('is happy with no questions or no kids', () => {
    expect(firstQuestionError([], {}, kids)).toBeNull()
    expect(firstQuestionError(questions, { consent: 'Yes' }, [])).toBeNull()
  })
})
