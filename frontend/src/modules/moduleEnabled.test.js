/**
 * The JS fallback evaluator must mirror backend/modules/enabled.py exactly.
 * Fixtures are the same real production shapes as
 * backend/tests/unit/test_module_effective.py -- change one side, change both.
 */

import { describe, expect, it } from 'vitest'
import { effectiveModules, moduleEnabled } from './moduleEnabled'

const org = (flags = {}, extra = {}) => ({
  id: 'org-1',
  feature_flags: flags,
  ai_features_enabled: true,
  ...extra,
})

describe('moduleEnabled', () => {
  it('answers from server-computed effective_modules when present', () => {
    const o = org({ sis_enabled: true }, { effective_modules: ['billing'] })
    expect(moduleEnabled(o, 'billing')).toBe(true)
    expect(moduleEnabled(o, 'attendance')).toBe(false) // list wins over flags
    expect(moduleEnabled(o, 'quests')).toBe(true) // core needs no list entry
  })

  it('core modules are on without an org and cannot be disabled', () => {
    expect(moduleEnabled(null, 'quests')).toBe(true)
    expect(moduleEnabled(org({ modules: { quests: false } }), 'quests')).toBe(true)
  })

  it('non-core modules are off without an org', () => {
    for (const key of ['sis', 'billing', 'journal', 'ai']) {
      expect(moduleEnabled(null, key)).toBe(false)
    }
  })

  it('icreate shape: sis on, nothing hidden, community opt-in', () => {
    const o = org({ sis_enabled: true, sis_settings: { community_enabled: true } })
    expect(moduleEnabled(o, 'billing')).toBe(true)
    expect(moduleEnabled(o, 'community')).toBe(true)
    expect(moduleEnabled(o, 'prior_learning')).toBe(false)
  })

  it('optio-academy shape: hidden modules off, goals mode on, catalog stays', () => {
    const o = org({
      sis_enabled: true,
      sis_settings: {
        hidden_modules: ['classes', 'attendance', 'timesheets'],
        post_registration_flow: 'goals',
        prior_learning_enabled: true,
      },
    })
    expect(moduleEnabled(o, 'classes')).toBe(false)
    expect(moduleEnabled(o, 'goals')).toBe(true)
    expect(moduleEnabled(o, 'prior_learning')).toBe(true)
    // requires is toggle-time only: catalog stays on though classes is hidden
    expect(moduleEnabled(o, 'catalog')).toBe(true)
  })

  it('parent cascade: sis off silences every SIS module', () => {
    const o = org({ modules: { community: true } })
    expect(moduleEnabled(o, 'community')).toBe(false)
    expect(moduleEnabled(o, 'billing')).toBe(false)
  })

  it('explicit modules entry beats the legacy answer', () => {
    const o = org({
      sis_enabled: true,
      modules: { billing: true },
      sis_settings: { hidden_modules: ['billing'] },
    })
    expect(moduleEnabled(o, 'billing')).toBe(true)
    expect(moduleEnabled(org({ sis_enabled: true, modules: { billing: false } }), 'billing')).toBe(false)
  })

  it('ai gates on the dedicated column, not flags', () => {
    expect(moduleEnabled(org({}, { ai_features_enabled: false }), 'ai')).toBe(false)
    expect(moduleEnabled(org({ modules: { ai: false } }), 'ai')).toBe(true)
  })

  it('hearthwood shape: oea_enabled grants credits, not transcripts', () => {
    const o = org({ oea_enabled: true })
    expect(moduleEnabled(o, 'credits')).toBe(true)
    expect(moduleEnabled(o, 'transcripts')).toBe(false)
  })

  it('unknown key fails loudly', () => {
    expect(() => moduleEnabled(org({}), 'not_a_module')).toThrow(/Unknown module key/)
  })

  it('effectiveModules(null) is exactly the core set', () => {
    expect(effectiveModules(null)).toEqual(
      ['messaging', 'portfolio', 'quests', 'teaching', 'xp'],
    )
  })
})
