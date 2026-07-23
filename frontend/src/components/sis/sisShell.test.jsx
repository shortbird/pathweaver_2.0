import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
// SisLayout mounts the feedback FAB, which reads the org context.
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: null }) }))
vi.mock('../../services/api', () => ({ default: { post: vi.fn(() => Promise.resolve({ data: {} })) } }))
// The sidebar resolves the active org via useSisOrg; stub it so these gate/nav
// tests don't depend on the org-list fetch. activeOrg null => nothing hidden.
vi.mock('../../pages/sis/useSisOrg', () => ({
  useSisOrg: () => ({ orgId: null, setOrgId: vi.fn(), orgs: [], isSuperadmin: true, loading: false, activeOrg: null }),
  withOrg: (p) => p,
}))

const nav = vi.hoisted(() => ({ goToLearningSurface: vi.fn(), goToSisSurface: vi.fn(), switchSurfaceInApp: vi.fn() }))
vi.mock('../../utils/appSurface', () => nav)

import SisLayout from './SisLayout'
import SisSidebar from './SisSidebar'

function renderLayout() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<SisLayout />}>
          <Route index element={<div>CHILD CONTENT</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
  vi.clearAllMocks()
})

describe('SisLayout gate', () => {
  it('renders staff children', () => {
    renderLayout()
    expect(screen.getByText('CHILD CONTENT')).toBeInTheDocument()
  })

  it('shows a spinner while auth is loading', () => {
    authState.loading = true
    renderLayout()
    expect(screen.queryByText('CHILD CONTENT')).not.toBeInTheDocument()
    expect(nav.goToLearningSurface).not.toHaveBeenCalled()
  })

  it('bounces unauthenticated visitors to the learning login', () => {
    authState = { isAuthenticated: false, effectiveRole: null, user: null, loading: false }
    renderLayout()
    expect(nav.goToLearningSurface).toHaveBeenCalledWith('/login')
  })

  it('bounces non-staff (students) back to the learning app', () => {
    authState = { isAuthenticated: true, effectiveRole: 'student', user: { role: 'student' }, loading: false }
    renderLayout()
    expect(nav.goToLearningSurface).toHaveBeenCalledWith('/')
    expect(screen.queryByText('CHILD CONTENT')).not.toBeInTheDocument()
  })
})

describe('SisSidebar', () => {
  it('shows the Users nav and links back to the learning app', () => {
    authState = { isAuthenticated: true, effectiveRole: 'superadmin', user: { role: 'superadmin' }, loading: false }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('Classes')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Switch to Learning app'))
    expect(nav.switchSurfaceInApp).toHaveBeenCalledWith('learning', '/dashboard')
  })

  it('shows the staff nav for org_admin', () => {
    authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('Classes')).toBeInTheDocument()
  })
})
