/**
 * The learning sidebar under a "view as" role view.
 *
 * Ticket 0f573318 (Arete org_admin): "I was on the school admin version and
 * then switched to family and now the school admin button keeps going back to
 * family". "School Admin" hopped to the console without ending the parent
 * view; the console's gate saw a parent and sent them to '/', which is
 * /family. The button now ends the view first.
 *
 * Ticket 43fee34b (Treehouse org_admin, 320px Android): "Can't toggle back to
 * my admin account after I switch to parent mode". The only exit sat in the
 * navbar account menu, which is `hidden sm:block`. The phone drawer's footer
 * now carries the same item.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let authState
let orgState
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('../../contexts/FamilyScopeContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useFamilyScope: () => ({ isScoped: false, selectedChild: null, hasFamily: false, children: [], isLoading: false }),
}))
vi.mock('../parent/ProfileSwitcher', () => ({ default: () => null }))
vi.mock('../admin/MasqueradeBanner', () => ({ default: () => null }))
vi.mock('../../services/masqueradeService', () => ({
  getMasqueradeState: () => null,
  exitMasquerade: vi.fn(),
  startMasquerade: vi.fn(),
}))

const order = vi.hoisted(() => [])
const apiMock = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: { success: true, orgs: [], courses: [] } })),
  post: vi.fn((url) => { order.push(`post ${url}`); return Promise.resolve({ data: {} }) }),
}))
vi.mock('../../services/api', () => ({ default: apiMock }))

const surface = vi.hoisted(() => ({
  switchSurfaceInApp: vi.fn((...a) => order.push(`switch ${a.join(' ')}`)),
  goToSisSurface: vi.fn((p) => order.push(`goToSis ${p}`)),
  goToLearningSurface: vi.fn(),
}))
vi.mock('../../utils/appSurface', async (importOriginal) => ({
  ...(await importOriginal()),
  ...surface,
}))

import Sidebar from './Sidebar'

const ADMIN_AS_PARENT = {
  id: 'u1',
  role: 'org_managed',
  org_role: 'parent',
  org_roles: ['parent'],
  is_org_admin: false,
  organization_id: 'org-1',
  email: 'a@example.com',
  role_view: { active_role: 'parent', available_roles: ['org_admin', 'parent'] },
}
const ADMIN = {
  id: 'u1',
  role: 'org_managed',
  org_role: 'org_admin',
  org_roles: ['org_admin', 'parent'],
  is_org_admin: true,
  organization_id: 'org-1',
  email: 'a@example.com',
  role_view: { active_role: null, available_roles: ['org_admin', 'parent'] },
}

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Sidebar isOpen isPinned onClose={vi.fn()} onTogglePin={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  localStorage.clear()
  orgState = { organization: { id: 'org-1', slug: 'arete', feature_flags: {} } }
})

describe('Sidebar "School Admin" under a parent role view (0f573318)', () => {
  it('ends the view before it goes to the console', async () => {
    authState = { user: ADMIN_AS_PARENT, logout: vi.fn(), isAuthenticated: true }
    renderSidebar()
    fireEvent.click(screen.getByText('School Admin'))
    await waitFor(() => expect(surface.goToSisSurface).toHaveBeenCalledWith('/'))
    expect(order).toEqual(['post /api/role-view/exit', 'goToSis /'])
    expect(surface.switchSurfaceInApp).not.toHaveBeenCalled()
  })

  it('shows the button even with no advisor assignments behind the view', () => {
    // Without has_advisor_assignments the narrowed admin passed no role check,
    // so the only door back was gone too.
    authState = { user: { ...ADMIN_AS_PARENT, has_advisor_assignments: false }, logout: vi.fn(), isAuthenticated: true }
    renderSidebar()
    expect(screen.getByText('School Admin')).toBeInTheDocument()
  })

  it('without a role view, behaves as before: an in-app hop, no exit call', () => {
    authState = { user: ADMIN, logout: vi.fn(), isAuthenticated: true }
    renderSidebar()
    fireEvent.click(screen.getByText('School Admin'))
    expect(surface.switchSurfaceInApp).toHaveBeenCalledWith('sis', '/')
    expect(apiMock.post).not.toHaveBeenCalled()
    expect(surface.goToSisSurface).not.toHaveBeenCalled()
  })
})

describe('Sidebar phone footer exit (43fee34b)', () => {
  it('renders "Exit “parent” view" in the phone-only footer while a view is active', async () => {
    authState = { user: ADMIN_AS_PARENT, logout: vi.fn(), isAuthenticated: true }
    renderSidebar()
    const exit = screen.getByRole('button', { name: 'Exit “parent” view' })
    // The footer is the drawer's lg:hidden block, the one beside Logout.
    expect(exit.closest('div.lg\\:hidden')).toContainElement(screen.getByRole('button', { name: 'Logout' }))
    fireEvent.click(exit)
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/api/role-view/exit', {}))
  })

  it('is absent without a role view', () => {
    authState = { user: ADMIN, logout: vi.fn(), isAuthenticated: true }
    renderSidebar()
    expect(screen.queryByRole('button', { name: /exit .* view/i })).not.toBeInTheDocument()
  })
})
