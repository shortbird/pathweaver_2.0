/**
 * Pillars hide for a student 13 or older (2026-09-28) and for a school that
 * switched them off. Under 13, or with no birthday on file, they stay: the task
 * form (backend services/task_rules.py::pillars_hidden_by_age) keeps them for
 * an unknown age, and the pages around the form must agree with it.
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import useHidePillars from '../useHidePillars'
import { AuthContext } from '../../contexts/AuthContext'
import { OrganizationContext } from '../../contexts/OrganizationContext'
import FamilyScopeContext from '../../contexts/FamilyScopeContext'

// From the LOCAL date, like ageFromDob. toISOString() is the UTC date, which is
// already tomorrow on a US evening, so "13 years ago" became a birthday one day
// short of 13 and the test failed every night after 6 pm Mountain.
const yearsAgo = (n) => {
  const d = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear() - n}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const run = ({ user = null, child = null, org = null } = {}) =>
  renderHook(() => useHidePillars(), {
    wrapper: ({ children }) => (
      <OrganizationContext.Provider value={org}>
        <AuthContext.Provider value={{ user }}>
          <FamilyScopeContext.Provider value={{ selectedChild: child }}>{children}</FamilyScopeContext.Provider>
        </AuthContext.Provider>
      </OrganizationContext.Provider>
    ),
  }).result.current

describe('useHidePillars', () => {
  it('hides them for a student 13 or older', () => {
    expect(run({ user: { role: 'student', date_of_birth: yearsAgo(15) } })).toBe(true)
    expect(run({ user: { role: 'org_managed', org_role: 'student', date_of_birth: yearsAgo(13) } })).toBe(true)
  })

  it('keeps them for a student under 13, or with no birthday on file', () => {
    expect(run({ user: { role: 'student', date_of_birth: yearsAgo(10) } })).toBe(false)
    expect(run({ user: { role: 'student', date_of_birth: null } })).toBe(false)
  })

  it("follows the child a parent is working for, not the parent", () => {
    const parent = { role: 'parent', date_of_birth: yearsAgo(40) }
    expect(run({ user: parent, child: { id: 'k', dateOfBirth: yearsAgo(16) } })).toBe(true)
    expect(run({ user: parent, child: { id: 'k', dateOfBirth: yearsAgo(8) } })).toBe(false)
    expect(run({ user: parent })).toBe(false)
  })

  it('leaves staff views alone', () => {
    expect(run({ user: { role: 'superadmin', date_of_birth: yearsAgo(40) } })).toBe(false)
  })

  it('still hides them for a school that switched them off, at any age', () => {
    const org = { organization: { feature_flags: { hide_pillars: true } } }
    expect(run({ user: { role: 'student', date_of_birth: yearsAgo(9) }, org })).toBe(true)
  })

  it('shows them with no providers at all', () => {
    expect(renderHook(() => useHidePillars()).result.current).toBe(false)
  })
})
