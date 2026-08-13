/**
 * Where /dashboard sends a campus coordinator.
 *
 * It used to redirect them to /sis-launch, on the reasoning that a coordinator's
 * home is the console. That turned the SIS sidebar's "Switch to Learning app"
 * button into a loop — the button navigates to /dashboard, and /dashboard threw
 * them straight back into the SIS, so the console had no exit (reported for
 * iCreate's coordinator, 2026-08-13).
 *
 * The rule these tests hold: this route never sends a coordinator back to the
 * surface they just left. Which home they get is secondary, and follows their
 * other role — a coordinator who is also a parent is a parent when off duty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let authState = {}
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))

// The homes themselves are covered by their own tests; here only the choice
// matters, and rendering the real ones would drag in their whole data layer.
vi.mock('./FamilyHome', () => ({ default: () => <div>family home</div> }))
vi.mock('./TeacherHome', () => ({ default: () => <div>teacher home</div> }))
vi.mock('./SchoolAdminHome', () => ({ default: () => <div>school admin home</div> }))
vi.mock('./SuperadminHome', () => ({ default: () => <div>superadmin home</div> }))
vi.mock('../DashboardPage', () => ({ default: () => <div>dashboard</div> }))

import RoleHome from './RoleHome'

const renderAt = () => render(<MemoryRouter initialEntries={['/dashboard']}><RoleHome /></MemoryRouter>)

const coordinator = (orgRoles) => ({
  user: { id: 'u1', role: 'org_managed', org_role: 'campus_coordinator', org_roles: orgRoles },
  effectiveRole: 'campus_coordinator',
  loading: false,
})

beforeEach(() => { authState = {} })

describe('a campus coordinator on the learning app', () => {
  it('is not thrown back to the SIS console', () => {
    authState = coordinator(['campus_coordinator'])
    renderAt()
    // A redirect would render nothing at all from this route.
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })

  it('gets her family home when she is also a parent', () => {
    // iCreate's coordinator, who has three students enrolled at the school.
    authState = coordinator(['campus_coordinator', 'parent'])
    renderAt()
    expect(screen.getByText('family home')).toBeInTheDocument()
  })

  it('gets the teacher home when she also teaches', () => {
    authState = coordinator(['campus_coordinator', 'advisor'])
    renderAt()
    expect(screen.getByText('teacher home')).toBeInTheDocument()
  })

  it('is never sent to the admin home, whose every tile she is refused', () => {
    authState = coordinator(['campus_coordinator', 'parent'])
    renderAt()
    expect(screen.queryByText('school admin home')).not.toBeInTheDocument()
  })

  it('survives a missing org_roles array', () => {
    authState = {
      user: { id: 'u1', role: 'org_managed', org_role: 'campus_coordinator' },
      effectiveRole: 'campus_coordinator',
      loading: false,
    }
    renderAt()
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })
})

describe('the other roles still land where they did', () => {
  it.each([
    ['parent', 'family home'],
    ['advisor', 'teacher home'],
    ['org_admin', 'school admin home'],
    ['superadmin', 'superadmin home'],
    ['student', 'dashboard'],
  ])('%s -> %s', (effectiveRole, expected) => {
    authState = { user: { id: 'u1' }, effectiveRole, loading: false }
    renderAt()
    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
