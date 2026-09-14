import { describe, it, expect } from 'vitest'
import { getPostLoginPath, roleHomePath, parentHomePath } from './postLoginPath'
import { OPTIO_ACADEMY_ORG_ID } from '../config/optioAcademy'

/**
 * The post-login landing map after the role-homes rewrite (2026-08-10):
 * every in-app role lands on /dashboard (which renders that role's Home);
 * the only forks left hop surfaces — SIS staff via /sis-launch, simplified
 * partner org admins via /onfire — plus observers straight to their feed,
 * and, since 2026-09-15, parents to the family dashboard at /family (their
 * /dashboard is a CHILD's dashboard, reachable once a child is picked).
 */

const SIS_ORG = { feature_flags: { sis_enabled: true } }
const PLAIN_ORG = { feature_flags: {} }
const SCHOOL_HOME = { id: 'org-1', name: 'iCreate', homepage: true }

describe('role homes landing', () => {
  it('lands students on the home route', () => {
    expect(getPostLoginPath({ role: 'student' })).toBe('/dashboard')
    expect(getPostLoginPath({ role: 'org_managed', org_role: 'student' })).toBe('/dashboard')
  })

  it('lands parents on the family dashboard', () => {
    expect(getPostLoginPath({ role: 'parent' })).toBe('/family')
    expect(getPostLoginPath({ role: 'org_managed', org_role: 'parent' })).toBe('/family')
  })

  it('no longer swaps the landing for school-homepage orgs — the school section lives inside Home', () => {
    expect(getPostLoginPath({ role: 'parent', school: SCHOOL_HOME })).toBe('/family')
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
    })).toBe('/family')
  })
})

describe('parents: the family dashboard is the home, at every school', () => {
  // Until 2026-09-15 only Optio Academy parents landed on the family
  // dashboard; everyone else got the /dashboard digest. There is one parent
  // page now, so the fork is gone.
  const academyParent = {
    role: 'org_managed', org_role: 'parent', organization_id: OPTIO_ACADEMY_ORG_ID,
  }

  it('lands Optio Academy parents on the family dashboard', () => {
    expect(getPostLoginPath(academyParent)).toBe('/family')
    expect(parentHomePath(academyParent)).toBe('/family')
  })

  it('and a platform parent whose school is resolved through the child', () => {
    const platformParent = { role: 'parent', school: { id: OPTIO_ACADEMY_ORG_ID } }
    expect(getPostLoginPath(platformParent)).toBe('/family')
    expect(parentHomePath({ role: 'parent' }, { id: OPTIO_ACADEMY_ORG_ID })).toBe('/family')
  })

  it('leaves every other role in the org on the shared home', () => {
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'student', organization_id: OPTIO_ACADEMY_ORG_ID,
    })).toBe('/dashboard')
  })

  it('and parents at other schools land there too', () => {
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'parent', organization_id: 'some-other-org',
    })).toBe('/family')
    expect(parentHomePath({ role: 'parent', school: SCHOOL_HOME })).toBe('/family')
  })

  it('does not hop Academy STAFF out of the console', () => {
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'org_admin',
      organization_id: OPTIO_ACADEMY_ORG_ID, organization: SIS_ORG,
    })).toBe('/sis-launch')
  })
})

describe('roleHomePath (in-app fallback, never hops surfaces)', () => {
  it('is /dashboard for every role except observers and parents', () => {
    expect(roleHomePath('student')).toBe('/dashboard')
    expect(roleHomePath('parent')).toBe('/family')
    expect(roleHomePath('advisor')).toBe('/dashboard')
    expect(roleHomePath('org_admin')).toBe('/dashboard')
    expect(roleHomePath('superadmin')).toBe('/dashboard')
    expect(roleHomePath('observer')).toBe('/observer/feed')
  })
})
