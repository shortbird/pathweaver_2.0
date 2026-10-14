import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordDoorsProvider } from '../../components/sis/RecordDoors'
import PeoplePage from './PeoplePage'

/**
 * People: "Set up sign-in" for every managed profile at once (ticket cd61587c).
 *
 * Mandie (Apogee Cache Valley): "Can I have logins created for all the
 * students that don't currently have one?" The People page lists the students
 * whose parent manages their profile and who have no sign-in, lets the office
 * untick any, and sets them all up in one request, with login cards to print.
 */

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/people']}><RecordDoorsProvider>{ui}</RecordDoorsProvider></MemoryRouter>
    </QueryClientProvider>,
  )
}

const { api, sisOrg, printCards } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  sisOrg: { orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, canViewAs: false,
    isAdmin: true, activeOrg: { name: 'Apogee Cache Valley' } },
  printCards: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', async () => {
  const React = await import('react')
  return { useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }), AuthContext: React.createContext(null) }
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
vi.mock('../../utils/credentialCardsPrinter', () => ({ printCredentialCards: printCards }))


const kid = (id, over = {}) => ({
  student_id: id, name: id, first_name: id, last_name: 'X', is_student: true, roles: ['student'], role: 'student',
  enrollment_status: 'enrolled', household_id: null, household_name: null, age: 9,
  joined_at: '2026-06-01T00:00:00Z', last_active: null, email: null, username: null, is_dependent: false, ...over,
})

const ROSTER = [
  kid('Ava Managed', { is_dependent: true }),
  kid('Ben Managed', { is_dependent: true, household_name: 'Bee' }),
  kid('Cy Username', { is_dependent: true, username: 'cyu' }),          // already signs in
  kid('Di Email', { email: 'di@school.org' }),                          // own login
  kid('Ed Former', { is_dependent: true, enrollment_status: 'withdrawn' }),
]

beforeEach(() => {
  vi.clearAllMocks()
  sisOrg.isAdmin = true
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/roster')) return Promise.resolve({ data: { roster: ROSTER } })
    return Promise.resolve({ data: {} })
  })
})

describe('Set up sign-in for many', () => {
  it('counts only current managed profiles with no sign-in', async () => {
    render(<PeoplePage />)
    expect(await screen.findByRole('button', { name: 'Set up sign-in (2)' })).toBeInTheDocument()
  })

  it('is not offered to staff outside the front office', async () => {
    sisOrg.isAdmin = false
    render(<PeoplePage />)
    await screen.findAllByText('Ava Managed')
    expect(screen.queryByRole('button', { name: /Set up sign-in/ })).not.toBeInTheDocument()
  })

  it('sends the ticked students and prints their login cards', async () => {
    api.post.mockResolvedValue({ data: {
      success: true, login_url: '/login/apogee-cv',
      results: [{ user_id: 'Ava Managed', name: 'Ava Managed', username: 'avam', password: '1234apple', parent_notified: true }],
      failed: [],
    } })
    render(<PeoplePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sign-in (2)' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText('Cy Username')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Ben Managed/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set up sign-in for 1' }))
    await within(dialog).findByText('avam / 1234apple')
    expect(api.post).toHaveBeenCalledWith('/api/admin/organizations/org-1/users/bulk-setup-sign-in',
      { user_ids: ['Ava Managed'] })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Print login cards' }))
    expect(printCards).toHaveBeenCalledWith(expect.objectContaining({
      loginUrl: 'https://app.test/login/apogee-cv', orgName: 'Apogee Cache Valley',
      credentials: [expect.objectContaining({ username: 'avam', password: '1234apple' })],
    }))
  })
})
