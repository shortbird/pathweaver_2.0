import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PrivateRoute from './PrivateRoute'

let authState = {}
let scopeState = { isScoped: false, isLoading: false }

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../contexts/FamilyScopeContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useFamilyScope: () => scopeState
}))

function renderWithRoute(requiredRole, initialRoute = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route element={<PrivateRoute requiredRole={requiredRole} />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Student Dashboard</div>} />
        <Route path="/family" element={<div>Family Dashboard</div>} />
        <Route path="/observer/feed" element={<div>Observer Feed</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PrivateRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  // --- Loading ---
  describe('loading state', () => {
    it('shows spinner while loading', () => {
      authState = { isAuthenticated: false, user: null, effectiveRole: null, loading: true }
      renderWithRoute()
      expect(screen.getByText((_, el) => el?.classList?.contains('animate-spin'))).toBeInTheDocument()
    })

    it('does not show content while loading', () => {
      authState = { isAuthenticated: false, user: null, effectiveRole: null, loading: true }
      renderWithRoute()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })
  })

  // --- Unauthenticated ---
  describe('unauthenticated', () => {
    it('redirects to /login when not authenticated', () => {
      authState = { isAuthenticated: false, user: null, effectiveRole: null, loading: false }
      renderWithRoute()
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
  })

  // --- Authenticated, no role required ---
  describe('authenticated without role requirement', () => {
    it('renders child when authenticated', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'student' }, effectiveRole: 'student', loading: false }
      renderWithRoute(undefined)
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  // --- Role matching ---
  describe('role matching', () => {
    it('renders when role matches single required role', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'student' }, effectiveRole: 'student', loading: false }
      renderWithRoute('student')
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('renders when role matches one of multiple required roles', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'student' }, effectiveRole: 'student', loading: false }
      renderWithRoute(['student', 'advisor'])
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('superadmin accesses any required role', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'superadmin' }, effectiveRole: 'superadmin', loading: false }
      renderWithRoute('advisor')
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('org_admin accesses org_admin routes via is_org_admin flag', () => {
      authState = {
        isAuthenticated: true,
        user: { id: '1', role: 'org_managed', org_role: 'advisor', is_org_admin: true },
        effectiveRole: 'advisor',
        loading: false
      }
      renderWithRoute('org_admin')
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  // --- Role mismatch redirects ---
  describe('role mismatch', () => {
    it('redirects student to /dashboard on role mismatch', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'student' }, effectiveRole: 'student', loading: false }
      renderWithRoute('advisor')
      expect(screen.getByText('Student Dashboard')).toBeInTheDocument()
    })

    it('redirects parent to /family (their home) on role mismatch', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'parent' }, effectiveRole: 'parent', loading: false }
      renderWithRoute('advisor')
      expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
    })

    it('redirects observer to /observer/feed on role mismatch', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'observer' }, effectiveRole: 'observer', loading: false }
      renderWithRoute('advisor')
      expect(screen.getByText('Observer Feed')).toBeInTheDocument()
    })
  })

  // --- Parent with dependents ---
  describe('parent relationship access', () => {
    it('allows user with has_dependents to access parent routes', () => {
      authState = {
        isAuthenticated: true,
        user: { id: '1', role: 'org_managed', org_role: 'advisor', has_dependents: true },
        effectiveRole: 'advisor',
        loading: false
      }
      renderWithRoute('parent')
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    // An iCreate parent: role='org_managed', the parent role only in
    // org_roles, neither flag set. The gate used to read the two flags and
    // not org_roles, so this account passed only because effectiveRole
    // happened to say 'parent'. It now reads the one predicate.
    it('allows an org member whose only parent role is in org_roles', () => {
      authState = {
        isAuthenticated: true,
        user: { id: '1', role: 'org_managed', org_roles: ['campus_coordinator', 'parent'] },
        effectiveRole: 'campus_coordinator',
        loading: false
      }
      renderWithRoute('parent')
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  // --- Family scope ---
  // The student surfaces (quests, journal, portfolio, classes) are open to a
  // parent, but only pointed at a child. Without one picked there is nothing
  // of the parent's own to show, so they go to /family to pick.
  describe('requireFamilyScope', () => {
    function renderScoped() {
      return render(
        <MemoryRouter initialEntries={['/quests']}>
          <Routes>
            <Route element={<PrivateRoute requireFamilyScope />}>
              <Route path="/quests" element={<div>Quest Library</div>} />
            </Route>
            <Route path="/family" element={<div>Family Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      )
    }

    it('sends an unscoped parent to /family', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'parent' }, effectiveRole: 'parent', loading: false }
      scopeState = { isScoped: false, isLoading: false }
      renderScoped()
      expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
    })

    it('lets a scoped parent through', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'parent' }, effectiveRole: 'parent', loading: false }
      scopeState = { isScoped: true, isLoading: false }
      renderScoped()
      expect(screen.getByText('Quest Library')).toBeInTheDocument()
    })

    it('never asks a student for a scope', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'student' }, effectiveRole: 'student', loading: false }
      scopeState = { isScoped: false, isLoading: false }
      renderScoped()
      expect(screen.getByText('Quest Library')).toBeInTheDocument()
    })

    // A campus coordinator who is also a parent has no student surface of
    // her own. effectiveRole says 'campus_coordinator' (org_roles[0]), and
    // the old `effectiveRole === 'parent'` guard let her open a quest link as
    // herself (tickets 94f42ce7 / 96ca40f3).
    it('sends an unscoped coordinator-parent to /family too', () => {
      authState = {
        isAuthenticated: true,
        user: { id: '1', role: 'org_managed', org_roles: ['campus_coordinator', 'parent'] },
        effectiveRole: 'campus_coordinator',
        loading: false,
      }
      scopeState = { isScoped: false, isLoading: false }
      renderScoped()
      expect(screen.getByText('Family Dashboard')).toBeInTheDocument()
    })

    // A teacher-parent has her own copy of every student page; she enters a
    // child's through the ProfileSwitcher when she wants to.
    it('does not ask an advisor-parent for a scope', () => {
      authState = {
        isAuthenticated: true,
        user: { id: '1', role: 'org_managed', org_roles: ['advisor', 'parent'] },
        effectiveRole: 'advisor',
        loading: false,
      }
      scopeState = { isScoped: false, isLoading: false }
      renderScoped()
      expect(screen.getByText('Quest Library')).toBeInTheDocument()
    })
  })
})
