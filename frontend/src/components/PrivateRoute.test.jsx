import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PrivateRoute from './PrivateRoute'

let authState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
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
        <Route path="/parent/dashboard" element={<div>Parent Dashboard</div>} />
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

    it('redirects parent to /parent/dashboard on role mismatch', () => {
      authState = { isAuthenticated: true, user: { id: '1', role: 'parent' }, effectiveRole: 'parent', loading: false }
      renderWithRoute('advisor')
      expect(screen.getByText('Parent Dashboard')).toBeInTheDocument()
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
  })
})
