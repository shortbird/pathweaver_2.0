/**
 * Which settings cards a surface carries for an org.
 *
 * Pins the kiosk card on BOTH surfaces: the kiosk block has no SIS parent, so
 * an LMS-only school provisions its classroom devices from the web app's
 * Organization → Settings tab. Before 2026-09-07 the card was console-only and
 * the block sat under the SIS switch, so a school without the console (Arete
 * Academy) had no way to reach it.
 */
import { describe, expect, it } from 'vitest'
import { settingsCardsFor } from './settingsRegistry'

const keys = (surface, org) =>
  settingsCardsFor({ surface, org, seesFinance: true }).map((c) => c.key)

describe('settingsCardsFor: the kiosk device card', () => {
  it('an LMS-only school with the block on gets the card on both surfaces', () => {
    const org = { feature_flags: { kiosk: true } } // no sis_enabled anywhere
    expect(keys('learning', org)).toContain('kiosk')
    expect(keys('console', org)).toContain('kiosk')
  })

  it('the explicit modules entry (what the Blocks panel writes) works the same', () => {
    const org = { feature_flags: { modules: { kiosk: true } } }
    expect(keys('learning', org)).toContain('kiosk')
  })

  it('no block, no card', () => {
    const org = { feature_flags: { sis_enabled: true } }
    expect(keys('learning', org)).not.toContain('kiosk')
    expect(keys('console', org)).not.toContain('kiosk')
  })

  it('the server-computed effective_modules list is the authority', () => {
    expect(keys('learning', { feature_flags: {}, effective_modules: ['kiosk'] })).toContain('kiosk')
    expect(keys('learning', { feature_flags: { kiosk: true }, effective_modules: [] })).not.toContain('kiosk')
  })

  it('the learning surface still carries only its own cards', () => {
    const org = { feature_flags: { kiosk: true, sis_enabled: true } }
    expect(keys('learning', org)).not.toContain('rooms')
    expect(keys('learning', org)).toContain('pillars')
    expect(keys('console', org)).not.toContain('pillars')
  })
})
