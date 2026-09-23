/**
 * /dashboard for a staff member who is also a parent, with a child picked.
 *
 * iCreate, Molly (org admin + parent), 2026-09-23. Ticket 376cb2ce: "Molly
 * works with brady, clicks Open, and goes to her admin home LMS page, not
 * brady's dashboard." Ticket bec3639e: "I can't open the quests". Open set the
 * family scope to Brady and went to /dashboard, but RoleHome switched on her
 * role and only the parent branch honoured the scope, so she got the admin
 * home with the scope silently set to Brady.
 *
 * The rule: a picked child wins over the role, for every role. With no child
 * picked ("Just me"), the role decides as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React, { useState } from 'react'
import FamilyScopeContext from '../../contexts/FamilyScopeContext'
import RoleHome from './RoleHome'

let authState = {}
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))

vi.mock('./TeacherHome', () => ({ default: () => <div>teacher home</div> }))
vi.mock('./SchoolAdminHome', () => ({ default: () => <div>school admin home</div> }))
vi.mock('./SuperadminHome', () => ({ default: () => <div>superadmin home</div> }))
vi.mock('../DashboardPage', () => ({ default: () => <div>child dashboard</div> }))


const BRADY = { id: 'brady', firstName: 'Brady' }

let controls = {}
// The real provider fetches the family; this one holds the same shape and
// lets a test pick a child or press "Just me".
function ScopeHarness({ initial, children }) {
  const [selected, setSelected] = useState(initial)
  controls = {
    enter: () => setSelected(BRADY),
    exit: () => setSelected(null),
  }
  const value = {
    hasFamily: true,
    children: [BRADY],
    isLoading: false,
    selectedChild: selected,
    selectedChildId: selected ? selected.id : null,
    isScoped: !!selected,
    enterScope: controls.enter,
    exitScope: controls.exit,
  }
  return <FamilyScopeContext.Provider value={value}>{children}</FamilyScopeContext.Provider>
}

const renderAt = (initial) => render(
  <ScopeHarness initial={initial}>
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<RoleHome />} />
        <Route path="/family" element={<div>family home</div>} />
      </Routes>
    </MemoryRouter>
  </ScopeHarness>
)

const molly = {
  user: { id: 'molly', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin', 'parent'] },
  effectiveRole: 'org_admin',
  loading: false,
}

beforeEach(() => { authState = molly; controls = {} })

describe('an org admin who is also a parent (376cb2ce / bec3639e)', () => {
  it('gets Brady\'s dashboard when she opens Brady', () => {
    renderAt(BRADY)
    expect(screen.getByText('child dashboard')).toBeInTheDocument()
    expect(screen.queryByText('school admin home')).not.toBeInTheDocument()
  })

  it('gets her admin home when no child is picked', () => {
    renderAt(null)
    expect(screen.getByText('school admin home')).toBeInTheDocument()
  })

  it('goes back to her admin home after "Just me"', () => {
    renderAt(BRADY)
    expect(screen.getByText('child dashboard')).toBeInTheDocument()
    act(() => controls.exit())
    expect(screen.getByText('school admin home')).toBeInTheDocument()
  })

  it.each([
    ['advisor', 'teacher home'],
    ['superadmin', 'superadmin home'],
  ])('a %s with a child picked also gets the child dashboard', (effectiveRole, unscopedHome) => {
    authState = { user: { id: 'u1' }, effectiveRole, loading: false }
    renderAt(BRADY)
    expect(screen.getByText('child dashboard')).toBeInTheDocument()
    expect(screen.queryByText(unscopedHome)).not.toBeInTheDocument()
  })
})
