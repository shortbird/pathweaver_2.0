import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StudentDetailModal from './StudentDetailModal'
import { AuthContext as Ctx } from '../../contexts/AuthContext'
import { toast } from 'react-hot-toast'

/**
 * "Reset password" on an email student (2026-10-06).
 *
 * The button POSTs {} and used to get 400 "new_password is required" for any
 * student with an email. The server now emails them a reset link; the
 * confirm says so up front and the toast shows the server's message, not a
 * password.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
const { confirmFn } = vi.hoisted(() => ({ confirmFn: vi.fn(async () => true) }))
vi.mock('../../contexts/ConfirmContext', () => ({
  useConfirm: () => confirmFn,
}))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))
vi.mock('../../components/ui/SearchSelect', () => ({ default: () => null }))
vi.mock('../../contexts/AuthContext', async () => {
  const React = await import('react')
  return { AuthContext: React.createContext(null) }
})

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

const ADMIN = { id: 'molly', role: 'org_managed', org_roles: ['org_admin'] }

const render = (person) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <Ctx.Provider value={{ user: ADMIN }}>
        <StudentDetailModal student={person} orgId="org-1" onClose={vi.fn()} />
      </Ctx.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: {} })
})

describe('Reset password', () => {
  it('tells the admin an email student gets a link, and shows the server message', async () => {
    api.post.mockResolvedValue({ data: { success: true, emailed: true,
      message: 'We emailed kid@school.org a link to set a new password.' } })
    render({ student_id: 's1', name: 'Silas M', is_student: true, roles: ['student'], email: 'kid@school.org' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(confirmFn.mock.calls[0][0]).toMatch(/Email Silas M a link.*kid@school\.org/)
    expect(api.post).toHaveBeenCalledWith('/api/admin/organizations/org-1/users/s1/reset-password', {})
    expect(toast.success.mock.calls[0][0]).toBe('We emailed kid@school.org a link to set a new password.')
  })

  it('still shows a username student their new password', async () => {
    api.post.mockResolvedValue({ data: { success: true, new_password: '1234apple' } })
    render({ student_id: 's2', name: 'Liam D', is_student: true, roles: ['student'], username: 'liamd' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(confirmFn.mock.calls[0][0]).toBe("Reset Liam D's password?")
    expect(toast.success.mock.calls[0][0]).toBe('New password: 1234apple')
  })
})
