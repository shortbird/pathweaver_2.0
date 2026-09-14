import { describe, it, expect } from 'vitest'
import {
  monthlyPlanFrom, monthlyLineItems, monthlyTotalCents, monthlyPlanSentence,
  toggleAddOn, studentsForPricing, PROGRAM_FEE_KEY,
} from '../monthlyPricing'
import { moneyCompact, feeStepLabel } from '../funnelUi'

/**
 * Browser-side mirror of backend/services/registration_pricing.py. The
 * numbers here are the same cases the backend pins, so a drift between the
 * two shows up as one of these failing rather than as a family seeing one
 * total on the page and another on Stripe.
 */

const TEACHER = {
  key: 'teacher_support', label: 'Optio teacher support',
  description: 'A weekly meeting with an Optio teacher.',
  amount_cents: 50000, includes_program_fee: true,
}
const ACADEMY = monthlyPlanFrom({ per_student_cents: 5000, family_cap_cents: 15000, add_ons: [TEACHER] })
const kid = (i, addOns = []) => ({ id: `kid-${i}`, name: `Kid${i}`, add_ons: addOns })

describe('monthlyPlanFrom', () => {
  it('is null when nothing bills monthly', () => {
    expect(monthlyPlanFrom(null)).toBeNull()
    expect(monthlyPlanFrom({})).toBeNull()
    expect(monthlyPlanFrom({ per_student_cents: 0, add_ons: [] })).toBeNull()
  })

  it('normalizes and drops malformed add-ons', () => {
    const plan = monthlyPlanFrom({
      per_student_cents: '5000',
      add_ons: [TEACHER, { key: '', label: 'no key', amount_cents: 1 },
        { key: 'free', label: 'Free', amount_cents: 0 },
        { key: 'teacher_support', label: 'dup', amount_cents: 1 },
        { key: PROGRAM_FEE_KEY, label: 'reserved', amount_cents: 1 }],
    })
    expect(plan.per_student_cents).toBe(5000)
    expect(plan.family_cap_cents).toBe(0)
    expect(plan.add_ons.map((a) => a.key)).toEqual(['teacher_support'])
  })
})

describe('monthlyTotalCents (Optio Academy rules)', () => {
  it('$50 for one kid, capped at $150 for three or more', () => {
    expect(monthlyTotalCents(ACADEMY, [kid(1)])).toBe(5000)
    expect(monthlyTotalCents(ACADEMY, [kid(1), kid(2), kid(3)])).toBe(15000)
    expect(monthlyTotalCents(ACADEMY, [kid(1), kid(2), kid(3), kid(4)])).toBe(15000)
  })

  it('a teacher includes the program fee: $500, not $550', () => {
    expect(monthlyTotalCents(ACADEMY, [kid(1, ['teacher_support'])])).toBe(50000)
    expect(monthlyTotalCents(ACADEMY, [kid(1, ['teacher_support']), kid(2)])).toBe(55000)
  })

  it('the cap applies to the kids without a teacher', () => {
    const kids = [kid(1, ['teacher_support']), kid(2), kid(3), kid(4), kid(5)]
    expect(monthlyTotalCents(ACADEMY, kids)).toBe(65000)
  })

  it('no plan is $0', () => {
    expect(monthlyTotalCents(null, [kid(1)])).toBe(0)
  })
})

describe('monthlyLineItems', () => {
  it('names who each line is for and flags the cap', () => {
    const items = monthlyLineItems(ACADEMY, [kid(1, ['teacher_support']), kid(2)])
    expect(items).toEqual([
      { key: PROGRAM_FEE_KEY, label: 'Program fee', amount_cents: 5000, students: ['Kid2'], capped: false },
      { key: 'teacher_support', label: 'Optio teacher support', amount_cents: 50000, students: ['Kid1'], capped: false },
    ])
    expect(monthlyLineItems(ACADEMY, [kid(1), kid(2), kid(3), kid(4)])[0].capped).toBe(true)
  })
})

describe('helpers', () => {
  it('reads the plan back as a sentence', () => {
    expect(monthlyPlanSentence(ACADEMY, moneyCompact))
      .toBe('$50 per student each month, capped at $150 per family.')
    expect(monthlyPlanSentence(monthlyPlanFrom({ per_student_cents: 1250 }), moneyCompact))
      .toBe('$12.50 per student each month.')
    expect(monthlyPlanSentence(monthlyPlanFrom({ add_ons: [TEACHER] }), moneyCompact)).toBe('')
  })

  it('toggles one add-on for one student', () => {
    let sel = toggleAddOn({}, 'kid-1', 'teacher_support', true)
    expect(sel).toEqual({ 'kid-1': ['teacher_support'] })
    sel = toggleAddOn(sel, 'kid-1', 'teacher_support', false)
    expect(sel).toEqual({ 'kid-1': [] })
  })

  it('prices server kids by user_id and preview cards by _key', () => {
    expect(studentsForPricing(
      [{ user_id: 'u1', first_name: 'Casey', name: 'Casey Sample', add_ons: ['teacher_support'] }], {},
    )).toEqual([{ id: 'u1', name: 'Casey', add_ons: ['teacher_support'] }])
    expect(studentsForPricing([{ _key: 'k1', first_name: 'Riley' }], { k1: ['teacher_support'] }))
      .toEqual([{ id: 'k1', name: 'Riley', add_ons: ['teacher_support'] }])
  })

  it('labels the money step by what the org charges', () => {
    expect(feeStepLabel({ monthly: ACADEMY })).toBe('Monthly payment')
    expect(feeStepLabel({ monthly: ACADEMY, registration_fee_cents: 2500 })).toBe('Payment')
    expect(feeStepLabel({ registration_fee_cents: 2500 })).toBe('Registration fee')
    expect(feeStepLabel({ stripe_enabled: true })).toBe('Registration fee')
  })
})
