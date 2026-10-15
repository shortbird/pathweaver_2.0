import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordDoorsProvider } from '../../components/sis/RecordDoors'
import { AuthContext } from '../../contexts/AuthContext'
import PeoplePage from './PeoplePage'

/**
 * People > "Login cards" (2026-10-15): print cards again for the students who
 * sign in with a username. Moved from the web organization console. New
 * passwords are an account action, so only an org admin sees the button --
 * the route (bulk-reset-passwords) is @require_org_admin.
 */

const { api, sisOrg, viewer } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  sisOrg: { orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, canViewAs: true,
    isAdmin: true, activeOrg: { name: 'Apogee', slug: 'apogee' } },
  viewer: { current: null },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', async () => {
  const React = await import('react')
  return { useAuth: () => ({ user: viewer.current }), AuthContext: React.createContext(null) }
})
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: { id: 'org-1' } }) }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('./useSisOrg', () => ({ useSisOrg: () => sisOrg, withOrg: (p) => p }))
vi.mock('./StudentDetailModal', () => ({ default: () => null }))
vi.mock('./FamilyDetailModal', () => ({ default: () => null }))
vi.mock('../../components/sis/StaffDetailModal', () => ({ default: () => null }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../utils/appSurface', () => ({
  switchSurfaceInApp: vi.fn(), getLearningOrigin: () => 'https://app.test', learningSurfaceHref: (p) => p,
}))

const render = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ user: viewer.current }}>
        <MemoryRouter initialEntries={['/people']}><RecordDoorsProvider><PeoplePage /></RecordDoorsProvider></MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const kid = (id, over = {}) => ({
  student_id: id, name: id, first_name: id, last_name: 'X', is_student: true, roles: ['student'], role: 'student',
  enrollment_status: 'enrolled', household_id: null, household_name: null, age: 9,
  joined_at: '2026-06-01T00:00:00Z', last_active: null, email: null, username: null, is_dependent: false, ...over,
})

const ROSTER = [
  kid('Ava Username', { username: 'avau' }),
  kid('Ben Username', { username: 'benu' }),
  kid('Cy Email', { username: 'cy', email: 'cy@school.org' }),        // resets by email
  kid('Di Former', { username: 'dif', enrollment_status: 'withdrawn' }),
  kid('Ed None'),
]

beforeEach(() => {
  vi.clearAllMocks()
  viewer.current = { id: 'molly', role: 'org_managed', org_roles: ['org_admin'] }
  // useSisOrg's canViewAs is sisRole.canViewAs(user): an admin, not only a coordinator.
  sisOrg.canViewAs = true
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/roster')) return Promise.resolve({ data: { roster: ROSTER } })
    return Promise.resolve({ data: {} })
  })
})

describe('Login cards', () => {
  it('lists current username students with no email', async () => {
    render()
    fireEvent.click(await screen.findByRole('button', { name: 'Login cards' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Ava Username')).toBeInTheDocument()
    expect(within(dialog).getByText('Ben Username')).toBeInTheDocument()
    expect(within(dialog).queryByText('Cy Email')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Di Former')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Ed None')).not.toBeInTheDocument()
  })

  it('is not offered to a campus coordinator', async () => {
    viewer.current = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }
    sisOrg.canViewAs = false
    render()
    await screen.findAllByText('Ava Username')
    expect(screen.queryByRole('button', { name: 'Login cards' })).not.toBeInTheDocument()
  })
})
