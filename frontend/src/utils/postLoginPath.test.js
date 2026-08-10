import { describe, it, expect } from 'vitest'
import { getPostLoginPath, roleHomePath } from './postLoginPath'

/**
 * The post-login landing map, and in particular the school-homepage opt-in
 * (feature_flags.sis_settings.school_homepage -> user.school.homepage): a
 * school that opted in front-doors its FAMILIES through /school, while its
 * staff still land in the SIS console they actually work in.
 */

const SCHOOL_HOME = { id: 'org-1', name: 'iCreate', homepage: true }
const SCHOOL_PLAIN = { id: 'org-2', name: 'Hearthwood Academy', homepage: false }

describe('school-homepage opt-in', () => {
  it('lands a parent of an opted-in school on the school page', () => {
    expect(getPostLoginPath({ role: 'parent', school: SCHOOL_HOME })).toBe('/school')
  })

  it('lands a student of an opted-in school on the school page', () => {
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'student',
      organization_id: 'org-1', school: SCHOOL_HOME,
    })).toBe('/school')
  })

  it('leaves families of schools that did not opt in where they were', () => {
    expect(getPostLoginPath({ role: 'parent', school: SCHOOL_PLAIN })).toBe('/parent/dashboard')
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'student',
      organization_id: 'org-2', school: SCHOOL_PLAIN,
    })).toBe('/dashboard')
  })

  it('never reroutes the school\'s own staff — they run it from the SIS console', () => {
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'org_admin',
      organization_id: 'org-1', school: SCHOOL_HOME,
    })).toBe('/organization')
    expect(getPostLoginPath({
      role: 'org_managed', org_role: 'advisor',
      organization_id: 'org-1', school: SCHOOL_HOME,
      organization: { feature_flags: { sis_enabled: true } },
    })).toBe('/sis-launch')
  })

  it('does not reroute a platform user with no school', () => {
    expect(getPostLoginPath({ role: 'parent' })).toBe('/parent/dashboard')
    expect(getPostLoginPath({ role: 'student' })).toBe('/dashboard')
  })
})

describe('showcase-only marketing accounts', () => {
  it('lands a showcase-flagged student account on the showcase', () => {
    expect(getPostLoginPath({ role: 'student', can_view_showcase: true })).toBe('/showcase')
  })

  it('does not divert anyone actively using the platform', () => {
    expect(getPostLoginPath({ role: 'student' })).toBe('/dashboard')
    expect(getPostLoginPath({ role: 'student', can_view_showcase: false })).toBe('/dashboard')
    expect(getPostLoginPath({ role: 'parent', can_view_showcase: true })).toBe('/parent/dashboard')
    expect(getPostLoginPath({ role: 'student', can_view_showcase: true, has_dependents: true })).toBe('/dashboard')
    expect(getPostLoginPath({ role: 'student', can_view_showcase: true, has_linked_students: true })).toBe('/dashboard')
  })
})

/**
 * roleHomePath is the fallback home for someone who can't stay where they are
 * (missing school context, back-button dead end, blocked route). Deliberately
 * NOT getPostLoginPath: it must never point at an optional surface like /school
 * (SchoolPage bounces here when school context is missing — pointing back at
 * /school would loop) and never hop surfaces to the SIS console.
 */
describe('roleHomePath', () => {
  it('maps parents and observers to their own homes', () => {
    expect(roleHomePath('parent')).toBe('/parent/dashboard')
    expect(roleHomePath('observer')).toBe('/observer/feed')
  })

  it('maps everyone else to the student dashboard', () => {
    expect(roleHomePath('student')).toBe('/dashboard')
    expect(roleHomePath('advisor')).toBe('/dashboard')
    expect(roleHomePath('org_admin')).toBe('/dashboard')
    expect(roleHomePath('superadmin')).toBe('/dashboard')
    expect(roleHomePath(null)).toBe('/dashboard')
  })
})
