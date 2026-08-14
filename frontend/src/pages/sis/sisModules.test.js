import { describe, it, expect } from 'vitest'
import { getHiddenModules, isPathHidden, isCommunityEnabled, SIS_MODULE_BY_PATH } from './sisModules'

const orgWith = (hidden) => ({ feature_flags: { sis_settings: { hidden_modules: hidden } } })

describe('sisModules', () => {
  it('returns an empty set when no config is present', () => {
    expect(getHiddenModules(null).size).toBe(0)
    expect(getHiddenModules({}).size).toBe(0)
    expect(getHiddenModules({ feature_flags: {} }).size).toBe(0)
    expect(getHiddenModules(orgWith(undefined)).size).toBe(0)
  })

  it('reads hidden_modules from feature_flags.sis_settings', () => {
    const hidden = getHiddenModules(orgWith(['clp', 'forms']))
    expect(hidden.has('clp')).toBe(true)
    expect(hidden.has('forms')).toBe(true)
    expect(hidden.has('billing')).toBe(false)
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

  it('never hides non-module paths', () => {
    expect(isPathHidden('/goals', orgWith(['clp']))).toBe(false)
    expect(isPathHidden('/submissions', orgWith(['clp']))).toBe(false)
    expect(isPathHidden('/', orgWith(['clp']))).toBe(false)
  })

  it('hides nothing when there is no active org (e.g. superadmin before selecting)', () => {
    for (const path of Object.keys(SIS_MODULE_BY_PATH)) {
      expect(isPathHidden(path, null)).toBe(false)
    }
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
      expect(isCommunityEnabled({ feature_flags: { sis_settings: {} } })).toBe(false)
    })

    it('is true only when community_enabled === true', () => {
      expect(isCommunityEnabled({ feature_flags: { sis_settings: { community_enabled: true } } })).toBe(true)
      expect(isCommunityEnabled({ feature_flags: { sis_settings: { community_enabled: false } } })).toBe(false)
      // Truthy-but-not-true values do not enable it.
      expect(isCommunityEnabled({ feature_flags: { sis_settings: { community_enabled: 'yes' } } })).toBe(false)
    })
  })
})
