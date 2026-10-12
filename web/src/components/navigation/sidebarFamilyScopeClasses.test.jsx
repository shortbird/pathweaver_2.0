import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import Sidebar from './Sidebar'

/**
 * Ticket 8700c16d (iCreate org admin who is also a parent): "When I am
 * working with brady I don't actually see his classes."
 *
 * "Working with" is family scope. The sidebar's Classes item appears when
 * /api/student/classes answers with a class, and it asked about the signed-in
 * parent -- who is in no class -- so the child's Classes never appeared. It
 * must ask about the scoped child, and key the query by the child so a switch
 * re-asks.
 */

let authState
let scopeState

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: null, school: null }),
}))
vi.mock('../../hooks/api/useDirectMessages', () => ({
  useUnreadCount: () => ({ data: undefined }),
}))
vi.mock('../../contexts/FamilyScopeContext', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useFamilyScope: () => scopeState }
})
const apiGet = vi.fn()
vi.mock('../../services/api', () => ({ default: { get: (...a) => apiGet(...a) } }))
vi.mock('../../services/masqueradeService', () => ({
  getMasqueradeState: () => null,
  exitMasquerade: vi.fn(),
}))

const renderSidebar = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <Sidebar isOpen isPinned onClose={vi.fn()} onTogglePin={vi.fn()} onHoverChange={vi.fn()} />
    </MemoryRouter>
  </QueryClientProvider>,
)

beforeEach(() => {
  vi.clearAllMocks()
  authState = {
    user: {
      id: 'mom', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin', 'parent'],
      organization_id: 'org-icreate', is_org_admin: true, has_dependents: true,
      email: 'mom@example.com',
    },
    effectiveRole: 'org_admin',
    logout: vi.fn(),
    isAuthenticated: true,
  }
  scopeState = {
    isScoped: true,
    selectedChild: { id: 'brady', firstName: 'Brady' },
    selectedChildId: 'brady',
  }
  apiGet.mockImplementation((url, config) => {
    if (url === '/api/student/classes') {
      // Only Brady is in a class; his mother is in none.
      const asked = config?.params?.student_id
      return Promise.resolve({ data: { classes: asked === 'brady' ? [{ id: 'indep' }] : [] } })
    }
    return Promise.resolve({ data: { courses: [] } })
  })
})

describe('Sidebar classes item in family scope (ticket 8700c16d)', () => {
  it("asks for the scoped child's classes and shows the item under the child's name", async () => {
    renderSidebar()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(
      '/api/student/classes', { params: { student_id: 'brady' } }))
    expect(await screen.findByRole('link', { name: /brady's classes/i }))
      .toHaveAttribute('href', '/org-classes')
  })

  it('asks about the signed-in person when no child is picked', async () => {
    scopeState = { isScoped: false, selectedChild: null, selectedChildId: null }
    renderSidebar()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/student/classes', { params: {} }))
    expect(screen.queryByRole('link', { name: /brady's classes/i })).not.toBeInTheDocument()
  })
})
