import { describe, it, expect } from 'vitest'
import { getHiddenModules, isPathHidden, isCommunityEnabled, isGoalsEnabled, SIS_MODULE_BY_PATH } from './sisModules'

// A SIS org (the console only exists for these); hidden_modules is the legacy
// opt-out list the module system answers through.
const orgWith = (hidden, extra = {}) => ({
  feature_flags: { sis_enabled: true, sis_settings: { hidden_modules: hidden, ...extra } },
})

describe('sisModules', () => {
  it('an unconfigured SIS org hides only the opt-ins', () => {
    const hidden = getHiddenModules(orgWith(undefined))
    // Opt-out modules all show...
    for (const key of ['billing', 'clp', 'tasks', 'classes', 'attendance']) {
      expect(hidden.has(key)).toBe(false)
    }
    // ...and the opt-ins are off until enabled -- that is what a tile filter
    // actually wants to know, which the old raw-array read couldn't say.
    for (const key of ['community', 'prior_learning', 'goals']) {
      expect(hidden.has(key)).toBe(true)
    }
  })

  it('reads the legacy hidden_modules opt-outs', () => {
    const hidden = getHiddenModules(orgWith(['clp', 'forms']))
    expect(hidden.has('clp')).toBe(true)
    expect(hidden.has('forms')).toBe(true)
    expect(hidden.has('billing')).toBe(false)
  })

  it('a null org hides nothing (superadmin before selecting)', () => {
    expect(getHiddenModules(null).size).toBe(0)
    for (const path of Object.keys(SIS_MODULE_BY_PATH)) {
      expect(isPathHidden(path, null)).toBe(false)
    }
  })

  it('hides a path whose module is in the org list', () => {
    const org = orgWith(['clp', 'timesheets'])
    expect(isPathHidden('/clp', org)).toBe(true)
    // '/time' maps to the same 'timesheets' module as '/timesheets'
    expect(isPathHidden('/time', org)).toBe(true)
    expect(isPathHidden('/timesheets', org)).toBe(true)
  })

  it('keeps paths whose module is not hidden (e.g. billing stays for Gryffin)', () => {
    const gryffin = orgWith(['onboarding', 'timesheets', 'forms', 'clp'])
    expect(isPathHidden('/billing', gryffin)).toBe(false)
    expect(isPathHidden('/clp', gryffin)).toBe(true)
    expect(isPathHidden('/forms', gryffin)).toBe(true)
  })

  it('hides the whole class surface (admin + teacher portal) under one key', () => {
    const org = orgWith(['classes'])
    expect(isPathHidden('/classes', org)).toBe(true)
    expect(isPathHidden('/my-classes', org)).toBe(true)
    expect(isPathHidden('/my-schedule', org)).toBe(true)
  })

  it('supports the operational modules Optio Academy opts out of', () => {
    const academy = orgWith(['classes', 'calendar', 'attendance', 'reports', 'resources', 'curriculum', 'training', 'secure_documents'])
    for (const path of ['/calendar', '/attendance', '/reports', '/resources', '/curriculum', '/training', '/secure-documents']) {
      expect(isPathHidden(path, academy)).toBe(true)
    }
    // Registration and messaging are untouched.
    expect(isPathHidden('/registration', academy)).toBe(false)
    expect(isPathHidden('/messaging', academy)).toBe(false)
  })

  it('opt-in paths hide until the org enables them; default-on paths show', () => {
    const org = orgWith(['clp'])
    // Goals and community are opt-ins -- hidden until enabled (the route
    // guards now cover them, not just the sidebar's mode flags).
    expect(isPathHidden('/goals', org)).toBe(true)
    expect(isPathHidden('/community', org)).toBe(true)
    // Submissions is default-on with its own (new) key.
    expect(isPathHidden('/submissions', org)).toBe(false)
    // Non-module paths are never hidden.
    expect(isPathHidden('/', org)).toBe(false)
  })

  it('the parent cascade: an org without the SIS has every module off', () => {
    const noSis = { feature_flags: { sis_settings: { community_enabled: true } } }
    expect(isPathHidden('/billing', noSis)).toBe(true)
    expect(isCommunityEnabled(noSis)).toBe(false)
    expect(getHiddenModules(noSis).has('billing')).toBe(true)
  })

  it('an explicit feature_flags.modules entry beats the legacy answer', () => {
    const org = orgWith(['billing'])
    org.feature_flags.modules = { billing: true }
    expect(isPathHidden('/billing', org)).toBe(false)
    const org2 = orgWith([])
    org2.feature_flags.modules = { billing: false }
    expect(isPathHidden('/billing', org2)).toBe(true)
  })

  describe('the unified task surfaces', () => {
    it('hides both task pages under one module key', () => {
      const org = orgWith(['tasks'])
      expect(isPathHidden('/my-tasks', org)).toBe(true)
      expect(isPathHidden('/tasks', org)).toBe(true)
    })

    it('leaves the task pages alone for an org that hid only forms', () => {
      /* An org that turned Forms off did not ask to lose the inbox where their
         signatures and checklists now live. */
      const org = orgWith(['forms'])
      expect(isPathHidden('/my-tasks', org)).toBe(false)
      expect(isPathHidden('/tasks', org)).toBe(false)
      expect(isPathHidden('/forms', org)).toBe(true)
    })

    it('keeps the promise already made to orgs that hid forms or onboarding', () => {
      /* Those keys stay meaningful rather than being folded into 'tasks': a
         saved config is a promise, and reusing its name silently breaks it. */
      const org = orgWith(['forms', 'onboarding'])
      expect(isPathHidden('/forms', org)).toBe(true)
      expect(isPathHidden('/onboarding', org)).toBe(true)
    })
  })

  describe('isCommunityEnabled (opt-in)', () => {
    it('is false by default (no flag, no org)', () => {
      expect(isCommunityEnabled(null)).toBe(false)
      expect(isCommunityEnabled({})).toBe(false)
      expect(isCommunityEnabled(orgWith([]))).toBe(false)
    })

    it('is true only when community_enabled === true (on a SIS org)', () => {
      expect(isCommunityEnabled(orgWith([], { community_enabled: true }))).toBe(true)
      expect(isCommunityEnabled(orgWith([], { community_enabled: false }))).toBe(false)
      // Truthy-but-not-true values do not enable it.
      expect(isCommunityEnabled(orgWith([], { community_enabled: 'yes' }))).toBe(false)
    })
  })

  describe('isGoalsEnabled (opt-in via the legacy flow enum)', () => {
    it('follows post_registration_flow === "goals"', () => {
      expect(isGoalsEnabled(orgWith([], { post_registration_flow: 'goals' }))).toBe(true)
      expect(isGoalsEnabled(orgWith([]))).toBe(false)
      expect(isGoalsEnabled(null)).toBe(false)
    })
  })
})
