import { describe, it, expect } from 'vitest'
import { getPostLoginPath, roleHomePath } from './postLoginPath'

/**
 * The post-login landing map after the role-homes rewrite (2026-08-10):
 * every in-app role lands on /dashboard (which renders that role's Home);
 * the only forks left hop surfaces — SIS staff via /sis-launch, simplified
 * partner org admins via /onfire — plus observers straight to their feed.
 */

const SIS_ORG = { feature_flags: { sis_enabled: true } }
const PLAIN_ORG = { feature_flags: {} }
const SCHOOL_HOME = { id: 'org-1', name: 'iCreate', homepage: true }

describe('role homes landing', () => {
  it('lands students on the home route', () => {
    expect(getPostLoginPath({ role: 'student' })).toBe('/dashboard')
    expect(getPostLoginPath({ role: 'org_managed', org_role: 'student' })).toBe('/dashboard')
  })

  it('lands parents on the home route (family home)', () => {
    expect(getPostLoginPath({ role: 'parent' })).toBe('/dashboard')
    expect(getPostLoginPath({ role: 'org_managed', org_role: 'parent' })).toBe('/dashboard')
  })

  it('no longer swaps the landing for school-homepage orgs — the school section lives inside Home', () => {
    expect(getPostLoginPath({ role: 'parent', school: SCHOOL_HOME })).toBe('/dashboard')
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'student',
      organization_id: 'org-1', school: SCHOOL_HOME,
    })).toBe('/dashboard')
  })

  it('lands superadmin on the home route (superadmin home), not the parent dashboard', () => {
    expect(getPostLoginPath({ role: 'superadmin' })).toBe('/dashboard')
  })

  it('sends observers straight to their feed', () => {
    expect(getPostLoginPath({ role: 'observer' })).toBe('/observer/feed')
  })
})

describe('SIS surface hops', () => {
  it('sends SIS-org staff to the console launcher', () => {
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'org_admin', organization: SIS_ORG,
    })).toBe('/sis-launch')
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'advisor', organization: SIS_ORG,
    })).toBe('/sis-launch')
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'campus_coordinator', organization: SIS_ORG,
    })).toBe('/sis-launch')
  })

  it('keeps non-SIS staff in the learning app', () => {
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'org_admin', organization: PLAIN_ORG,
    })).toBe('/dashboard')
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'advisor', organization: PLAIN_ORG,
    })).toBe('/dashboard')
  })

  it('never hops SIS families to the console', () => {
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'student', organization: SIS_ORG,
    })).toBe('/dashboard')
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'parent', organization: SIS_ORG,
    })).toBe('/dashboard')
  })
})

describe('roleHomePath (in-app fallback, never hops surfaces)', () => {
  it('is /dashboard for every role except observers', () => {
    expect(roleHomePath('student')).toBe('/dashboard')
    expect(roleHomePath('parent')).toBe('/dashboard')
    expect(roleHomePath('advisor')).toBe('/dashboard')
    expect(roleHomePath('org_admin')).toBe('/dashboard')
    expect(roleHomePath('superadmin')).toBe('/dashboard')
    expect(roleHomePath('observer')).toBe('/observer/feed')
  })
})
