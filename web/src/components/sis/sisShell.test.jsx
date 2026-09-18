import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
// The stub is still a HOOK (it calls useState), because the real one is: a
// stub that calls no hook would let useSisOrg be called after an early return
// without React noticing, and that is the exact bug the re-render test below
// exists to catch.
vi.mock('../../pages/sis/useSisOrg', async () => {
  const { useState } = await import('react')
  return {
    useSisOrg: () => {
      const [orgId] = useState(null)
      return { orgId, setOrgId: vi.fn(), orgs: [], isSuperadmin: true, loading: false, activeOrg: null }
    },
    withOrg: (p) => p,
  }
})

const nav = vi.hoisted(() => ({ goToLearningSurface: vi.fn(), goToSisSurface: vi.fn(), switchSurfaceInApp: vi.fn() }))
vi.mock('../../utils/appSurface', () => nav)

import SisLayout from './SisLayout'
import SisSidebar from './SisSidebar'
import { setPreviewTeacher, clearPreviewTeacher } from '../../pages/sis/teacherPreview'

// The badge polls two unread endpoints through react-query; these tests render
// the sidebar without a QueryClientProvider and only care about the nav items.
vi.mock('./InboxUnreadBadge', () => ({ default: () => null }))

// The bell in the layout reads notifications through react-query
// (hooks/api/useNotifications), so the layout needs a client.
function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route element={<SisLayout />}>
            <Route index element={<div>CHILD CONTENT</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
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

  it('survives auth finishing loading in the same mounted tree', () => {
    // The first render returns a Spinner while auth loads; the second renders
    // the console. A hook placed after that early return runs only on the
    // second render, and React throws "Rendered more hooks than during the
    // previous render" -- which took the whole console down on 2026-09-17
    // when the org picker moved into this layout. Every hook, including
    // useSisOrg, has to run on both renders.
    authState.loading = true
    const { rerender } = renderLayout()
    expect(screen.queryByText('CHILD CONTENT')).not.toBeInTheDocument()
    authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    expect(() => rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Routes>
            <Route element={<SisLayout />}>
              <Route index element={<div>CHILD CONTENT</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )).not.toThrow()
    expect(screen.getByText('CHILD CONTENT')).toBeInTheDocument()
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

  it('gives a campus coordinator the admin nav, without the money pages', () => {
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
    // Their own tasks and documents, and the office's queue: one entry, tabs
    // inside (the old My Documents link — iCreate, 2026-08-26 — is a tab; so
    // is the Task Center since 2026-09-17).
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.queryByText('Task Center')).not.toBeInTheDocument()
    // The teacher portal too: the admin tiers hold everything a teacher holds.
    expect(screen.getByText('My Classes')).toBeInTheDocument()
    expect(screen.getByText('My Schedule')).toBeInTheDocument()
    expect(screen.getByText('My Time')).toBeInTheDocument()
    expect(screen.getByText('My Profile')).toBeInTheDocument()
    // Directory is People without the tabs, so admins get People instead.
    expect(screen.queryByText('Directory')).not.toBeInTheDocument()
    // Not the money.
    expect(screen.queryByText('Billing')).not.toBeInTheDocument()
    expect(screen.queryByText('Tuition')).not.toBeInTheDocument()
    expect(screen.queryByText('Timesheets')).not.toBeInTheDocument()
    // Not the HR store (contracts, background checks).
    expect(screen.queryByText('Secure Documents')).not.toBeInTheDocument()
  })

  it('gives an org admin the teacher portal alongside the admin console', () => {
    // An org admin has every capability a teacher has. At a microschool the
    // admin IS the teacher: Horizon's director created her own classes and then
    // had no way into the class page where the quest builder lives, because
    // My Classes was hidden from admins and the admin Classes page never links
    // there (2026-09-11: "it feels like we've lost the ability to make quests
    // ourselves").
    authState = {
      isAuthenticated: true,
      effectiveRole: 'org_admin',
      user: { id: 'u1', role: 'org_managed', org_role: 'org_admin' },
      loading: false,
    }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'My Classes' })).toHaveAttribute('href', '/my-classes')
    expect(screen.getByRole('link', { name: 'My Schedule' })).toHaveAttribute('href', '/my-schedule')
    expect(screen.getByRole('link', { name: 'My Time' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My Profile' })).toBeInTheDocument()
    // Still the admin console.
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('Classes')).toBeInTheDocument()
    expect(screen.getByText('Billing')).toBeInTheDocument()
    // One roster entry, not two: Directory is the teacher's stand-in for People.
    expect(screen.queryByText('Directory')).not.toBeInTheDocument()
  })

  it('has no separate document or task entries — one Tasks page holds them as tabs', () => {
    // Secure documents is an HR-only tab (enforced there and on the server);
    // My documents, My tasks and the office's Requests / Assigned / Templates
    // are the others. One entry, not six nouns.
    authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks')
    expect(screen.queryByText('My Tasks')).not.toBeInTheDocument()
    expect(screen.queryByText('Task Center')).not.toBeInTheDocument()
    expect(screen.queryByText('Onboarding')).not.toBeInTheDocument()
    expect(screen.queryByText('Secure Documents')).not.toBeInTheDocument()
    expect(screen.queryByText('My Documents')).not.toBeInTheDocument()
  })

  it('keeps Tasks while previewing a teacher — the page lands the preview on documents', () => {
    // /api/sis/my-tasks deliberately takes no ?teacher_id=, so the task inbox
    // cannot answer for the teacher — but the Documents tab can, and the page
    // opens there under a preview (with a banner on the tasks tab naming whose
    // list it would be). Hiding the entry would strand the preview with no way
    // to reach the teacher's documents at all.
    authState = { isAuthenticated: true, effectiveRole: 'org_admin', user: { role: 'org_admin' }, loading: false }
    setPreviewTeacher({ id: 'teach-1', name: 'Ana Rogers' })
    try {
      render(<MemoryRouter><SisSidebar /></MemoryRouter>)
      expect(screen.getByText('Tasks')).toBeInTheDocument()
      expect(screen.getByText('My Classes')).toBeInTheDocument()
    } finally {
      clearPreviewTeacher()
    }
  })
})

describe('SisLayout notifications', () => {
  // The console shipped without any notification surface: no bell, no unread
  // count in the chrome. Teachers in SIS-enabled orgs only found a student's
  // message by opening each class in turn (Gryffin, Perch d7300f59).
  it('mounts the notification bell for staff', () => {
    renderLayout()
    expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument()
  })

  it('keeps the bell at desktop width — it is not part of the mobile-only header', () => {
    // The menu button and wordmark are lg:hidden; the bell must not inherit
    // that, or the surface where teachers actually work still has no bell.
    renderLayout()
    expect(screen.getByLabelText(/notifications/i).closest('.lg\\:hidden')).toBeNull()
  })
})
