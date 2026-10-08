import { describe, it, expect } from 'vitest'
import { cardGroupsFor } from './schoolCards'

/**
 * A family-side card follows its module (docs/sis/SIS_SIMPLIFICATION.md,
 * rule 2): a school sees the doors for the blocks it runs, and none for the
 * blocks it has off.
 */

const names = (org) => cardGroupsFor(org).flatMap((g) => g.cards.map((c) => c.name))
const school = (modules) => ({ id: 'o1', is_guardian: true, post_registration_flow: 'schedule', modules })

describe('cardGroupsFor', () => {
  it('Carpool is the community board, so it follows community', () => {
    expect(names(school(['community']))).toContain('Carpool')
    expect(names(school(['calendar']))).not.toContain('Carpool')
  })

  it('Weekly Goals and Points show only where the school runs them', () => {
    expect(names(school(['weekly_goals', 'points']))).toEqual(expect.arrayContaining(['Weekly Goals', 'Points']))
    const none = names(school(['calendar']))
    expect(none).not.toContain('Weekly Goals')
    expect(none).not.toContain('Points')
  })

  it('an older payload without the module list never offers an opt-in card', () => {
    const old = names({ id: 'o1', is_guardian: true, post_registration_flow: 'schedule' })
    expect(old).not.toContain('Weekly Goals')
    expect(old).not.toContain('Points')
  })
})
