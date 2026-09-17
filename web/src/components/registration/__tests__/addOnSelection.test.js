import { describe, it, expect } from 'vitest'
import { toggleAddOn, studentsForPricing, addOnsFromKids } from '../addOnSelection'

describe('addOnSelection', () => {
  it('toggles one add-on for one student', () => {
    let sel = toggleAddOn({}, 'k1', 'teacher_support', true)
    expect(sel).toEqual({ k1: ['teacher_support'] })
    sel = toggleAddOn(sel, 'k1', 'teacher_support', false)
    expect(sel).toEqual({ k1: [] })
  })

  it('shapes server kids by user_id and preview cards by _key', () => {
    const kids = [{ user_id: 'k1', preferred_name: 'Cee', first_name: 'Casey', add_ons: ['x'] },
                  { _key: 'draft-1', name: 'Riley Sample' }]
    expect(studentsForPricing(kids, { k1: ['teacher_support'] })).toEqual([
      { id: 'k1', name: 'Cee', add_ons: ['teacher_support'] },
      { id: 'draft-1', name: 'Riley', add_ons: [] },
    ])
  })

  it('reads the stored selection back off the kids', () => {
    expect(addOnsFromKids([{ user_id: 'k1', add_ons: ['a'] }, { user_id: 'k2' }, { _key: 'x' }]))
      .toEqual({ k1: ['a'], k2: [] })
  })
})
