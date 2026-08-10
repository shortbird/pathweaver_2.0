import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
// SisLayout mounts the feedback FAB, which reads the org context.
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organization: null }) }))
// The teacher chrome (onboarding nudge) fetches assignments on mount.
vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} })),
    get: vi.fn(() => Promise.resolve({ data: { assignments: [] } })),
  },
}))
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

  it('mounts the feedback FAB for teachers, not just admins', () => {
    authState = { isAuthenticated: true, effectiveRole: 'advisor', user: { role: 'org_managed', org_role: 'advisor' }, loading: false }
    renderLayout()
    expect(screen.getByLabelText('Send beta feedback')).toBeInTheDocument()
  })

  it('bounces non-staff (students) back to the web platform', () => {
    authState = { isAuthenticated: true, effectiveRole: 'student', user: { role: 'student' }, loading: false }
    renderLayout()
    expect(nav.goToLearningSurface).toHaveBeenCalledWith('/')
    expect(screen.queryByText('CHILD CONTENT')).not.toBeInTheDocument()
  })

  it('lets a campus coordinator into the console', () => {
    // The coordinator runs the campus from this console — the launcher on the
    // learning sidebar is pointless if the gate here bounces them back out.
    authState = {
      isAuthenticated: true,
      effectiveRole: 'campus_coordinator',
      user: { id: 'u1', role: 'org_managed', org_roles: ['campus_coordinator'] },
      loading: false,
    }
    renderLayout()
    expect(screen.getByText('CHILD CONTENT')).toBeInTheDocument()
    expect(nav.goToLearningSurface).not.toHaveBeenCalled()
  })
})

describe('SisSidebar', () => {
  it('shows the Users nav and links back to the web platform', () => {
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

  it('gives a campus coordinator the admin nav, without the teacher or money pages', () => {
    authState = {
      isAuthenticated: true,
      effectiveRole: 'campus_coordinator',
      user: { id: 'u1', role: 'org_managed', org_roles: ['campus_coordinator'] },
      loading: false,
    }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    // The front office: same console an admin gets.
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('Registration')).toBeInTheDocument()
    // Not the teacher portal — a coordinator is not a teacher.
    expect(screen.queryByText('My Classes')).not.toBeInTheDocument()
    expect(screen.queryByText('My Schedule')).not.toBeInTheDocument()
    expect(screen.queryByText('Directory')).not.toBeInTheDocument()
    expect(screen.queryByText('My Documents')).not.toBeInTheDocument()
    expect(screen.queryByText('My Time')).not.toBeInTheDocument()
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument()
    // Not the money.
    expect(screen.queryByText('Billing')).not.toBeInTheDocument()
    expect(screen.queryByText('Tuition')).not.toBeInTheDocument()
    expect(screen.queryByText('Timesheets')).not.toBeInTheDocument()
    // Not the HR store (contracts, background checks).
    expect(screen.queryByText('Secure Documents')).not.toBeInTheDocument()
  })

  it('keeps Secure Documents for an org admin', () => {
    authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByText('Secure Documents')).toBeInTheDocument()
  })
})
