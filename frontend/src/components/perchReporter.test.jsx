import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

let authState = { user: null }
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))

let orgState = { organization: null }
vi.mock('../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))

import PerchReporter from './PerchReporter'

const perchScript = () =>
  document.querySelector('script[src="https://perch.shortbird.dev/perch.js"]')

beforeEach(() => {
  document.head.innerHTML = ''
  delete window.PerchConfig
  delete window.__perch
  authState = { user: null }
  orgState = { organization: null }
})

describe('PerchReporter', () => {
  it('injects the widget for teachers, not just admins', () => {
    // The org_managed + org_role shape is how iCreate teachers arrive.
    authState = { user: { role: 'org_managed', org_role: 'advisor', email: 'teach@school.org' } }
    orgState = { organization: { slug: 'icreate' } }
    render(<PerchReporter />)
    expect(perchScript()).toBeTruthy()
    expect(window.PerchConfig.tenant).toBe('icreate')
    // The widget turns this into the "email me when it's fixed" checkbox.
    expect(window.PerchConfig.email).toBe('teach@school.org')
  })

  it('injects for staff with no org, with an empty tenant', () => {
    authState = { user: { role: 'superadmin' } }
    render(<PerchReporter />)
    expect(perchScript()).toBeTruthy()
    expect(window.PerchConfig.tenant).toBe('')
  })

  it('never injects for students, and removes the widget on downgrade', () => {
    const remove = vi.fn()
    window.__perch = { remove }
    authState = { user: { role: 'student' } }
    render(<PerchReporter />)
    expect(perchScript()).toBeFalsy()
    expect(remove).toHaveBeenCalled()
  })
})
