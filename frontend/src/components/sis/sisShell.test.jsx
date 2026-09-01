import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
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
import { setPreviewTeacher, clearPreviewTeacher } from '../../pages/sis/teacherPreview'

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

  it('bounces non-staff (students) back to the web platform', () => {
    authState = { isAuthenticated: true, effectiveRole: 'student', user: { role: 'student' }, loading: false }
    renderLayout()
    expect(nav.goToLearningSurface).toHaveBeenCalledWith('/')
    expect(screen.queryByText('CHILD CONTENT')).not.toBeInTheDocument()
  })

  it('lets a teacher in when their primary role is parent', () => {
    // iCreate, 2026-08-19: a teacher who also parents a student here is stored
    // as ['parent', 'advisor'] — the order is whatever was written first, and
    // it is not a statement about what she does. Gating on the primary role
    // alone bounced her back to the web platform from the very console the
    // sidebar launcher had just offered her.
    authState = {
      isAuthenticated: true,
      effectiveRole: 'parent',
      user: { id: 'u2', role: 'org_managed', org_role: 'parent', org_roles: ['parent', 'advisor'] },
      loading: false,
    }
    renderLayout()
    expect(screen.getByText('CHILD CONTENT')).toBeInTheDocument()
    expect(nav.goToLearningSurface).not.toHaveBeenCalled()
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
    // Their own tasks and documents: one entry, tabs inside (the old My
    // Documents link — iCreate, 2026-08-26 — is a tab of My Tasks now).
    expect(screen.getByText('My Tasks')).toBeInTheDocument()
    expect(screen.getByText('Task Center')).toBeInTheDocument()
    // Not the teacher portal — a coordinator is not a teacher.
    expect(screen.queryByText('My Classes')).not.toBeInTheDocument()
    expect(screen.queryByText('My Schedule')).not.toBeInTheDocument()
    expect(screen.queryByText('Directory')).not.toBeInTheDocument()
    expect(screen.queryByText('My Time')).not.toBeInTheDocument()
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument()
    // Not the money.
    expect(screen.queryByText('Billing')).not.toBeInTheDocument()
    expect(screen.queryByText('Tuition')).not.toBeInTheDocument()
    expect(screen.queryByText('Timesheets')).not.toBeInTheDocument()
    // Not the HR store (contracts, background checks).
    expect(screen.queryByText('Secure Documents')).not.toBeInTheDocument()
  })

  it('has no separate document entries — the stores live inside the two task pages', () => {
    // Secure Documents is the Documents tab of Task Center (HR only, enforced
    // there and on the server); My Documents is a tab of My Tasks. Two entries
    // per side of the desk, not four nouns.
    authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByText('My Tasks')).toBeInTheDocument()
    expect(screen.getByText('Task Center')).toBeInTheDocument()
    expect(screen.queryByText('Secure Documents')).not.toBeInTheDocument()
    expect(screen.queryByText('My Documents')).not.toBeInTheDocument()
  })

  it('keeps My Tasks while previewing a teacher — the page lands the preview on documents', () => {
    // /api/sis/my-tasks deliberately takes no ?teacher_id=, so the task inbox
    // cannot answer for the teacher — but the Documents tab can, and the page
    // opens there under a preview (with a banner on the tasks tab naming whose
    // list it would be). Hiding the entry would strand the preview with no way
    // to reach the teacher's documents at all.
    authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
    setPreviewTeacher({ id: 'teach-1', name: 'Ana Rogers' })
    try {
      render(<MemoryRouter><SisSidebar /></MemoryRouter>)
      expect(screen.getByText('My Tasks')).toBeInTheDocument()
      expect(screen.getByText('My Classes')).toBeInTheDocument()
    } finally {
      clearPreviewTeacher()
    }
  })
})
