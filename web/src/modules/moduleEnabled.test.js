/**
 * The JS fallback evaluator must mirror backend/modules/enabled.py exactly.
 * Fixtures are the same real production shapes as
 * backend/tests/unit/test_module_effective.py -- change one side, change both.
 */

import { describe, expect, it } from 'vitest'
import { effectiveModules, moduleEnabled, moduleKnownOff } from './moduleEnabled'

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
    // Off: iCreate does not issue Optio Academy diplomas (2026-10-07).
    expect(moduleEnabled(o, 'prior_learning')).toBe(false)
  })

  it('prior learning exists only where the diploma is Optio Academy’s', () => {
    const diploma = (flags) => ({ ...org({ sis_enabled: true, ...flags }), accreditation_source: 'optio' })
    expect(moduleEnabled(diploma({}), 'prior_learning')).toBe(true)
    expect(moduleEnabled(org({ sis_enabled: true, sis_settings: { prior_learning_enabled: true } }),
      'prior_learning')).toBe(false)
    // A diploma school may still switch it off.
    expect(moduleEnabled(diploma({ sis_settings: { prior_learning_enabled: false } }),
      'prior_learning')).toBe(false)
    expect(moduleEnabled(diploma({ modules: { prior_learning: false } }), 'prior_learning')).toBe(false)
  })

  it('optio-academy shape: hidden modules off, goals mode on, catalog stays', () => {
    const o = org({
      sis_enabled: true,
      sis_settings: {
        hidden_modules: ['classes', 'attendance', 'timesheets'], // timesheets: no such module since 2026-09-18; ignored
        post_registration_flow: 'goals',
        prior_learning_enabled: true,
      },
    })
    o.accreditation_source = 'optio'
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

  it('kiosk is a platform block: on without sis, from either key', () => {
    expect(moduleEnabled(org({}), 'kiosk')).toBe(false)
    expect(moduleEnabled(org({ kiosk: true }), 'kiosk')).toBe(true)
    expect(moduleEnabled(org({ modules: { kiosk: true } }), 'kiosk')).toBe(true)
    expect(moduleEnabled(org({ kiosk: true, modules: { kiosk: false } }), 'kiosk')).toBe(false)
    expect(effectiveModules(org({ kiosk: true }))).not.toContain('sis')
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

/**
 * The starter baseline (docs/MICROSCHOOL_FIRST_PLAN.md, part 1). Same cases as
 * backend/tests/unit/test_module_effective.py.
 */
describe('moduleEnabled: the starter baseline', () => {
  const STARTER_OFF = ['registration', 'catalog', 'billing', 'tasks', 'onboarding',
    'secure_documents', 'clp', 'resources', 'training']

  it('turns the office side off and keeps the teaching side', () => {
    const o = org({ sis_enabled: true, module_baseline: 'starter' })
    for (const key of STARTER_OFF) expect(moduleEnabled(o, key)).toBe(false)
    for (const key of ['classes', 'attendance', 'submissions', 'curriculum', 'calendar', 'reports',
      'journal', 'friends', 'student_chat']) {
      expect(moduleEnabled(o, key)).toBe(true)
    }
  })

  it('lets an explicit modules entry win', () => {
    const o = org({ sis_enabled: true, module_baseline: 'starter',
      modules: { billing: true, registration: true, classes: false } })
    expect(moduleEnabled(o, 'billing')).toBe(true)
    expect(moduleEnabled(o, 'registration')).toBe(true)
    expect(moduleEnabled(o, 'classes')).toBe(false)
    expect(moduleEnabled(o, 'tasks')).toBe(false)
  })

  it('beats the legacy hidden_modules answer', () => {
    const o = org({ sis_enabled: true, module_baseline: 'starter',
      sis_settings: { hidden_modules: ['attendance'] } })
    expect(moduleEnabled(o, 'tasks')).toBe(false)
    expect(moduleEnabled(o, 'attendance')).toBe(false)
    expect(moduleEnabled(o, 'calendar')).toBe(true)
  })

  it('does not turn on the console', () => {
    expect(moduleEnabled(org({ module_baseline: 'starter' }), 'sis')).toBe(false)
  })

  it('leaves orgs without the key exactly as before (iCreate, Horizon)', () => {
    // iCreate carries clp_enabled: CLP is opt-in on it since 2026-10-08.
    const icreate = org({ sis_enabled: true, sis_settings: { community_enabled: true, clp_enabled: true } })
    const horizon = org({ sis_enabled: true, icreate_registration: { enabled: true },
      modules: { student_chat: false } })
    for (const key of STARTER_OFF) {
      expect(moduleEnabled(icreate, key)).toBe(true)
      // Horizon never ran CLPs; the module follows clp_enabled, not the baseline.
      if (key !== 'clp') expect(moduleEnabled(horizon, key)).toBe(true)
    }
    expect(moduleEnabled(horizon, 'clp')).toBe(false)
    expect(moduleEnabled(org({ sis_enabled: true, module_baseline: 'everything' }), 'billing')).toBe(true)
  })
})

/**
 * moduleKnownOff gates "skip a request that would 404 anyway", so its whole
 * job is to distinguish "the org says no" from "this payload cannot say".
 * Getting that backwards hides live features (Sentry OPTIO-BACKEND-81/85/89).
 */
describe('moduleKnownOff', () => {
  it('says off when the server-computed list omits the key', () => {
    expect(moduleKnownOff(org({}, { effective_modules: ['sis', 'billing'] }), 'onboarding')).toBe(true)
  })

  it('says nothing-known when the list includes the key', () => {
    expect(moduleKnownOff(org({}, { effective_modules: ['sis', 'onboarding'] }), 'onboarding')).toBe(false)
  })

  it('falls back to feature_flags when there is no list', () => {
    const hidden = org({ sis_enabled: true, sis_settings: { hidden_modules: ['onboarding'] } })
    expect(moduleKnownOff(hidden, 'onboarding')).toBe(true)
    expect(moduleKnownOff(org({ sis_enabled: true }), 'onboarding')).toBe(false)
  })

  it('cannot tell from a payload carrying neither, so it does not say off', () => {
    // The /api/sis/parent/context org shape: no feature_flags at all. Negating
    // moduleEnabled here would report EVERY sis module off, because the
    // fallback finds no sis_enabled in {} to satisfy the parent cascade.
    expect(moduleKnownOff({ organization_id: 'o1' }, 'onboarding')).toBe(false)
    // OrganizationContext's degraded shape when /api/auth/me could not load it.
    expect(moduleKnownOff({ id: 'o1' }, 'classes')).toBe(false)
    expect(moduleEnabled({ id: 'o1' }, 'classes')).toBe(false) // the trap it avoids
  })

  it('cannot tell without an org either', () => {
    expect(moduleKnownOff(null, 'classes')).toBe(false)
    expect(moduleKnownOff(undefined, 'classes')).toBe(false)
  })

  it('never reports a core module off', () => {
    expect(moduleKnownOff(org({}, { effective_modules: [] }), 'quests')).toBe(false)
  })
})

describe('moduleEnabled: the microschool baseline (2026-10-08)', () => {
  // Mirrors backend/modules/enabled.py; the registry test holds the key sets.
  const micro = (extra = {}) => org({ sis_enabled: true, module_baseline: 'microschool', ...extra })

  it('starts one child at a time: no classes, roll, timetable, curriculum or reports', () => {
    for (const key of ['classes', 'attendance', 'calendar', 'curriculum', 'reports', 'registration', 'billing', 'tasks']) {
      expect(moduleEnabled(micro(), key)).toBe(false)
    }
  })

  it('starts with weekly goals, individual students and the inbox on', () => {
    for (const key of ['weekly_goals', 'individual_work', 'submissions']) {
      expect(moduleEnabled(micro(), key)).toBe(true)
    }
  })

  it('an explicit switch still wins either way', () => {
    const o = micro({ modules: { classes: true, weekly_goals: false } })
    expect(moduleEnabled(o, 'classes')).toBe(true)
    expect(moduleEnabled(o, 'weekly_goals')).toBe(false)
  })
})
