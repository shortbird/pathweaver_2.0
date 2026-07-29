import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({ api: { post: vi.fn(() => Promise.resolve({ data: { success: true, report_id: 'r1' } })) } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() }, default: {} }))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: { id: 'org-1', name: 'iCreate' } }),
}))

import FeedbackFab from './FeedbackFab'
import { isStaffUser, userHasRole } from '../../utils/userRoles'

beforeEach(() => vi.clearAllMocks())

describe('FeedbackFab', () => {
  it('tags reports with the learning surface when mounted there', async () => {
    render(<FeedbackFab surface="learning" platform="web" />)
    fireEvent.click(screen.getByLabelText('Send beta feedback'))
    fireEvent.click(screen.getByText("I don't understand this"))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What is this page for?' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/bug-reports',
      expect.objectContaining({
        platform: 'web',
        extra: expect.objectContaining({ report_type: 'confusion', surface: 'learning', organization_id: 'org-1' }),
      }),
    ))
  })

  it('defaults to the SIS surface', async () => {
    render(<FeedbackFab />)
    fireEvent.click(screen.getByLabelText('Send beta feedback'))
    fireEvent.click(screen.getByText('Report a bug'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Roster is empty' } })
    fireEvent.click(screen.getByText('Send'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/bug-reports',
      expect.objectContaining({ platform: 'web-sis', extra: expect.objectContaining({ surface: 'sis' }) }),
    ))
  })
})

describe('isStaffUser', () => {
  it('includes teachers however their advisor role is stored', () => {
    expect(isStaffUser({ role: 'advisor' })).toBe(true)
    expect(isStaffUser({ role: 'org_managed', org_role: 'advisor' })).toBe(true)
    expect(isStaffUser({ role: 'org_managed', org_roles: ['parent', 'advisor'] })).toBe(true)
    expect(isStaffUser({ role: 'parent', has_advisor_assignments: true })).toBe(true)
  })

  it('includes admins', () => {
    expect(isStaffUser({ role: 'superadmin' })).toBe(true)
    expect(isStaffUser({ role: 'org_managed', org_role: 'org_admin' })).toBe(true)
    expect(isStaffUser({ role: 'org_managed', is_org_admin: true })).toBe(true)
  })

  it('excludes families and students', () => {
    expect(isStaffUser({ role: 'student' })).toBe(false)
    expect(isStaffUser({ role: 'org_managed', org_role: 'parent' })).toBe(false)
    expect(isStaffUser({ role: 'observer' })).toBe(false)
    expect(isStaffUser(null)).toBe(false)
  })

  it('userHasRole checks all three role shapes', () => {
    expect(userHasRole({ role: 'advisor' }, 'advisor')).toBe(true)
    expect(userHasRole({ org_roles: ['advisor'] }, 'advisor')).toBe(true)
    expect(userHasRole({ org_role: 'advisor' }, 'advisor')).toBe(true)
    expect(userHasRole({ role: 'student' }, 'advisor')).toBe(false)
  })
})
