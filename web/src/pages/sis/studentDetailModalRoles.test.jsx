import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StudentDetailModal from './StudentDetailModal'
import { AuthContext as Ctx } from '../../contexts/AuthContext'

/**
 * The people-page role picker draws the same line the staff card does.
 *
 * 2026-09-14: "the campus coordinator role needs to be able to change the
 * roles of other users. They can't change admin or make new users admin, but
 * can change roles from CC down." The picker used to show every role to
 * everyone and let the backend sort it out — which for a coordinator meant a
 * refused role PATCH failing the whole profile save. Now the Admin option is
 * withheld from them, and the picker is withheld entirely on an admin's row.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({
  useConfirm: () => vi.fn(async () => true),
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
const COORDINATOR = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }

const teacher = { student_id: 'u1', name: 'Ashley S', is_student: false, roles: ['advisor'] }
const admin = { student_id: 'u2', name: 'Molly M', is_student: false, roles: ['org_admin'] }

const render = (person, viewer) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <Ctx.Provider value={{ user: viewer }}>
        <StudentDetailModal student={person} orgId="org-1" onClose={vi.fn()} />
      </Ctx.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: {} })
  api.patch.mockResolvedValue({ data: { success: true } })
})

describe('the people-page role picker for a campus coordinator', () => {
  it('offers every role below admin', () => {
    render(teacher, COORDINATOR)
    expect(screen.getByRole('checkbox', { name: 'Campus Coordinator' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Teacher' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('sends the role change', async () => {
    render(teacher, COORDINATOR)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Campus Coordinator' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/users/u1/role',
      { roles: ['advisor', 'campus_coordinator'], organization_id: 'org-1' },
    ))
  })

  it('withholds the picker on an admin, and does not re-send their roles on save', async () => {
    render(admin, COORDINATOR)
    expect(screen.queryByText('Roles')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(api.patch).toHaveBeenCalled())
    const urls = api.patch.mock.calls.map(([url]) => url)
    expect(urls).not.toContain('/api/sis/users/u2/role')
  })
})

describe('the people-page role picker for an admin', () => {
  it('still offers Admin, on an admin\'s row too', () => {
    render(admin, ADMIN)
    expect(screen.getByRole('checkbox', { name: 'Admin' })).toBeInTheDocument()
  })
})
