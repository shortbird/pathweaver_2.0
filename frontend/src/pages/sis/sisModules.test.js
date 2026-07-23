import { describe, it, expect } from 'vitest'
import { getHiddenModules, isPathHidden, SIS_MODULE_BY_PATH } from './sisModules'

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
})
