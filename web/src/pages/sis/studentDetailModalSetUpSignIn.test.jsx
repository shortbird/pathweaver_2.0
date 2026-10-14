import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StudentDetailModal from './StudentDetailModal'
import { AuthContext as Ctx } from '../../contexts/AuthContext'

/**
 * "Set up sign-in" on a profile a parent manages (ticket cd61587c).
 *
 * Staff had no way to give a managed child profile a login: Reset password
 * answered 400 for an account with no email and no username. The Account
 * section now offers Set up sign-in for exactly those profiles, and only
 * those; everyone else keeps Reset password.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../../utils/appSurface', () => ({
  switchSurfaceInApp: vi.fn(),
  getLearningOrigin: () => 'https://app.test',
}))
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
const SETUP_URL = '/api/admin/organizations/org-1/users/kid-1/setup-sign-in'

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

const MANAGED = { student_id: 'kid-1', name: 'Ava Watson', is_student: true, roles: ['student'],
  is_dependent: true, username: null, email: null }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(async (url) => (url === SETUP_URL
    ? { data: { suggested_username: 'avaw', name: 'Ava Watson' } }
    : { data: {} }))
})

describe('Set up sign-in', () => {
  it('is offered for a managed profile instead of Reset password', () => {
    render(MANAGED)
    expect(screen.getByRole('button', { name: 'Set up sign-in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset password' })).not.toBeInTheDocument()
  })

  it('is not offered to a student who already signs in', () => {
    render({ ...MANAGED, is_dependent: false, email: 'kid@school.org' })
    expect(screen.queryByRole('button', { name: 'Set up sign-in' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument()
  })

  it('is not offered to a managed profile that already has a username', () => {
    render({ ...MANAGED, username: 'avaw' })
    expect(screen.queryByRole('button', { name: 'Set up sign-in' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeInTheDocument()
  })

  it('suggests a username, lets staff change it, and shows the password once', async () => {
    api.post.mockResolvedValue({ data: { success: true, username: 'ava.w', password: '1234apple',
      login_url: '/login/apogee-cv', parent_notified: true } })
    render(MANAGED)
    fireEvent.click(screen.getByRole('button', { name: 'Set up sign-in' }))
    const input = await screen.findByLabelText('Username')
    await vi.waitFor(() => expect(input).toHaveValue('avaw'))
    fireEvent.change(input, { target: { value: 'Ava.W' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create sign-in' }))
    const creds = await screen.findByTestId('sign-in-credentials')
    expect(api.post).toHaveBeenCalledWith(SETUP_URL, { username: 'ava.w' })
    expect(creds).toHaveTextContent('1234apple')
    expect(creds).toHaveTextContent('https://app.test/login/apogee-cv')
    expect(creds).toHaveTextContent('Their parent got a notice')
  })

  it('shows the server refusal for a username already used', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'The username "avaw" is already used at this school. Try "avawatson".' } } })
    render(MANAGED)
    fireEvent.click(screen.getByRole('button', { name: 'Set up sign-in' }))
    await vi.waitFor(() => expect(screen.getByLabelText('Username')).toHaveValue('avaw'))
    fireEvent.click(screen.getByRole('button', { name: 'Create sign-in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already used at this school')
  })
})
