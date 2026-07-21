import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireParentRegistration from './RequireParentRegistration'
import { clearICreateRegistrationGate } from '../hooks/useICreateRegistrationGate'

let authState = {}
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../services/api', () => ({ default: api }))

const renderGate = () => render(
  <MemoryRouter initialEntries={['/schedule-builder']}>
    <Routes>
      <Route element={<RequireParentRegistration />}>
        <Route path="/schedule-builder" element={<div>Schedule Builder</div>} />
      </Route>
      <Route path="/register/icreate/resume" element={<div>Registration Funnel</div>} />
    </Routes>
  </MemoryRouter>
)

const PARENT_TEACHER = {
  id: 'k', organization_id: 'org1', org_role: 'advisor', org_roles: ['advisor', 'parent'],
}

beforeEach(() => {
  vi.clearAllMocks()
  clearICreateRegistrationGate()
})

describe('RequireParentRegistration', () => {
  it('redirects a parent-teacher with an unfinished registration to the funnel', async () => {
    authState = { isAuthenticated: true, loading: false, user: PARENT_TEACHER }
    api.get.mockResolvedValue({ data: { registration: { status: 'family' } } })
    renderGate()
    expect(await screen.findByText('Registration Funnel')).toBeInTheDocument()
  })

  it('lets a parent-teacher through once registration is complete', async () => {
    authState = { isAuthenticated: true, loading: false, user: PARENT_TEACHER }
    api.get.mockResolvedValue({ data: { registration: null } })
    renderGate()
    expect(await screen.findByText('Schedule Builder')).toBeInTheDocument()
  })

  it('blocks on the fee step too (fee not yet paid)', async () => {
    authState = { isAuthenticated: true, loading: false, user: PARENT_TEACHER }
    api.get.mockResolvedValue({ data: { registration: { status: 'fee' } } })
    renderGate()
    expect(await screen.findByText('Registration Funnel')).toBeInTheDocument()
  })

  it('does not gate a teacher who has no children', async () => {
    authState = { isAuthenticated: true, loading: false,
      user: { id: 't', organization_id: 'org1', org_role: 'advisor', org_roles: ['advisor'] } }
    api.get.mockResolvedValue({ data: { registration: { status: 'family' } } })
    renderGate()
    expect(await screen.findByText('Schedule Builder')).toBeInTheDocument()
  })
})
