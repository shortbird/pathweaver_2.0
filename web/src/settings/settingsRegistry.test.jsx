/**
 * Which settings cards the SIS console carries for an org.
 *
 * Pins the kiosk card to the block, not to the SIS switch: the kiosk block has
 * no SIS parent. Before 2026-09-07 the block sat under the SIS switch, so a
 * school without the console (Arete Academy) had no way to reach it.
 *
 * Until 2026-10-15 there was a second surface, the learning app's
 * /organization Settings tab ('learning'). It was removed when every org
 * became an SIS org, so no card may still name it -- it would render nowhere.
 */
import { describe, expect, it } from 'vitest'
import { SETTINGS_CARDS, settingsCardsFor } from './settingsRegistry'

const keys = (surface, org) =>
  settingsCardsFor({ surface, org, seesFinance: true }).map((c) => c.key)

describe('settingsCardsFor: the kiosk device card', () => {
  it('a school with the block on gets the card', () => {
    const org = { feature_flags: { kiosk: true } } // no sis_enabled anywhere
    expect(keys('console', org)).toContain('kiosk')
  })

  it('the explicit modules entry (what the Blocks panel writes) works the same', () => {
    const org = { feature_flags: { modules: { kiosk: true } } }
    expect(keys('console', org)).toContain('kiosk')
  })

  it('no block, no card', () => {
    const org = { feature_flags: { sis_enabled: true } }
    expect(keys('console', org)).not.toContain('kiosk')
  })

  it('the server-computed effective_modules list is the authority', () => {
    expect(keys('console', { feature_flags: {}, effective_modules: ['kiosk'] })).toContain('kiosk')
    expect(keys('console', { feature_flags: { kiosk: true }, effective_modules: [] })).not.toContain('kiosk')
  })
})

describe('the settings surfaces', () => {
  it('every card renders on the console; none names the removed learning surface', () => {
    for (const card of SETTINGS_CARDS) {
      expect(card.surfaces, card.key).toContain('console')
      expect(card.surfaces, card.key).not.toContain('learning')
    }
  })

  it('the cards the learning tab used to carry are all on the console', () => {
    // What /organization's Settings tab rendered on its last day (2026-10-15).
    const org = { feature_flags: { kiosk: true }, effective_modules: ['kiosk', 'friends'] }
    const onConsole = keys('console', org)
    for (const key of ['org', 'login-link', 'kiosk', 'pillars', 'step-printing', 'friends', 'student-chat', 'task-xp-floor']) {
      expect(onConsole, key).toContain(key)
    }
    expect(keys('learning', org)).toEqual([])
  })
})
