/**
 * /family-directory is for guardians and staff, not students.
 *
 * iCreate, 82485501 (2026-09-22): "should students have access to the entire
 * family directory?" The owner's answer was no. The card is gone from a
 * student's school page (school/schoolCards familiesAndStaff), the backend
 * refuses the read (sis_parent_service.is_guardian_or_staff), and the route
 * sends a student home rather than rendering a page that can only 403.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import PrivateRoute from '../components/PrivateRoute'

let authState = {}
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../contexts/FamilyScopeContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useFamilyScope: () => ({ isScoped: false, isLoading: false }),
}))

// The same guard App.jsx puts around the route; the source assertion below
// pins that the two agree.
const renderAt = () => render(
  <MemoryRouter initialEntries={['/family-directory']}>
    <Routes>
      <Route element={<PrivateRoute blockRoles={['student', 'observer']} />}>
        <Route path="/family-directory" element={<div>Directory page</div>} />
      </Route>
      <Route path="/dashboard" element={<div>Student home</div>} />
      <Route path="/family" element={<div>Family home</div>} />
      <Route path="/observer/feed" element={<div>Observer home</div>} />
    </Routes>
  </MemoryRouter>,
)

const signedIn = (effectiveRole) => {
  authState = { isAuthenticated: true, loading: false, effectiveRole,
                user: { id: 'u1', role: effectiveRole } }
}

beforeEach(() => { sessionStorage.clear() })

describe('the family directory route (82485501)', () => {
  it('is guarded in App.jsx against students', () => {
    const app = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf8')
    expect(app).toMatch(
      /<Route element=\{<PrivateRoute blockRoles=\{\['student', 'observer'\]\} \/>\}>\s*<Route path="family-directory" element=\{<FamilyDirectoryPage \/>\} \/>/,
    )
  })

  it('sends a student home', () => {
    signedIn('student')
    renderAt()
    expect(screen.getByText('Student home')).toBeInTheDocument()
    expect(screen.queryByText('Directory page')).not.toBeInTheDocument()
  })

  it.each(['parent', 'advisor', 'org_admin', 'campus_coordinator', 'superadmin'])(
    'opens for %s', (role) => {
      signedIn(role)
      renderAt()
      expect(screen.getByText('Directory page')).toBeInTheDocument()
    },
  )
})
