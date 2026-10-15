import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import StaffDetailModal from '../StaffDetailModal'
import { AuthContext } from '../../../contexts/AuthContext'

/**
 * The staff record's Students tab (2026-10-15): a teacher's assigned
 * students, moved from the web organization console's Relationships section.
 */

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: api }))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => async () => true }))
vi.mock('../../../contexts/AuthContext', async () => {
  const R = await import('react')
  const AuthContext = R.createContext(null)
  return { AuthContext, useAuth: () => R.useContext(AuthContext) || {} }
})
// The other two tabs are not under test.
vi.mock('./ProfilePanel', () => ({ default: () => <div>profile</div> }))
vi.mock('./EmploymentPanel', () => ({ default: () => <div>employment</div> }))

const ADMIN = { id: 'molly', role: 'org_managed', org_roles: ['org_admin'] }
const COORDINATOR = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }

const TEACHER = { id: 't-1', student_id: 't-1', name: 'Tom Teacher', roles: ['advisor'], email: 'tom@s.org',
  is_placeholder: false }

const render = (staff = TEACHER, viewer = ADMIN, initialTab) => rtlRender(
  <AuthContext.Provider value={{ user: viewer }}>
    <StaffDetailModal orgId="org-1" staff={staff} initialTab={initialTab} onClose={vi.fn()} onSaved={vi.fn()} />
  </AuthContext.Provider>,
)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(async (url) => {
    if (url.endsWith('/advisors/t-1/students')) {
      return { data: { students: [{ id: 's-1', first_name: 'Ava', last_name: 'Watson', email: null }] } }
    }
    if (url.endsWith('/students/advisor-assignments')) {
      return { data: { students: [
        { id: 's-1', first_name: 'Ava', last_name: 'Watson', advisor_count: 1 },
        { id: 's-2', first_name: 'Ben', last_name: 'Bee', advisor_count: 0 },
        { id: 's-3', first_name: 'Cy', last_name: 'Sea', advisor_count: 2 },
      ] } }
    }
    return { data: {} }
  })
  api.post.mockResolvedValue({ data: { success: true } })
  api.delete.mockResolvedValue({ data: { success: true } })
})

describe('Students tab', () => {
  it('is a tab for a teacher', () => {
    render()
    expect(screen.getByRole('tab', { name: 'Students' })).toBeInTheDocument()
  })

  it('is not a tab for a coordinator who teaches nothing, or for a placeholder', () => {
    const { unmount } = render({ ...TEACHER, roles: ['campus_coordinator'] })
    expect(screen.queryByRole('tab', { name: 'Students' })).not.toBeInTheDocument()
    unmount()
    render({ ...TEACHER, is_placeholder: true })
    expect(screen.queryByRole('tab', { name: 'Students' })).not.toBeInTheDocument()
  })

  it('lists the assigned students and removes one', async () => {
    render(TEACHER, ADMIN, 'students')
    const list = await screen.findByRole('list', { name: 'Assigned students' })
    expect(within(list).getByText('Ava Watson')).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/advisors/t-1/students/s-1'))
  })

  it('assigns several at once, leaving out the ones already assigned', async () => {
    render(TEACHER, COORDINATOR, 'students')
    await screen.findByRole('list', { name: 'Assigned students' })
    fireEvent.click(screen.getByRole('button', { name: 'Assign students' }))
    await screen.findByText('Ben Bee')
    expect(screen.getAllByText('Ava Watson')).toHaveLength(1) // only in the assigned list
    fireEvent.click(screen.getByRole('checkbox', { name: /Ben Bee/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Cy Sea/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign 2 students' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post).toHaveBeenCalledWith('/api/admin/organizations/org-1/advisors/t-1/students', { student_id: 's-2' })
    expect(api.post).toHaveBeenCalledWith('/api/admin/organizations/org-1/advisors/t-1/students', { student_id: 's-3' })
  })

  it('can show only students with no teacher', async () => {
    render(TEACHER, ADMIN, 'students')
    await screen.findByRole('list', { name: 'Assigned students' })
    fireEvent.click(screen.getByRole('button', { name: 'Assign students' }))
    await screen.findByText('Cy Sea')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only students with no teacher' }))
    expect(screen.queryByText('Cy Sea')).not.toBeInTheDocument()
    expect(screen.getByText('Ben Bee')).toBeInTheDocument()
  })
})
