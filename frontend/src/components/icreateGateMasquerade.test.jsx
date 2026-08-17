import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PrivateRoute from './PrivateRoute'
import { clearICreateRegistrationGate } from '../hooks/useICreateRegistrationGate'

// A parent stuck mid-funnel is locked to /enroll/resume — that is the point of
// the gate, and their own login must keep hitting it. An admin masquerading as
// them is the one exception: the support session exists to see the app AS the
// parent, so the lock has to lift for the masquerade session only.

let authState = {}
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../services/api', () => ({ default: api, tokenStore: {} }))

const { isMasquerading } = vi.hoisted(() => ({ isMasquerading: vi.fn() }))
vi.mock('../services/masqueradeService', () => ({ isMasquerading }))

const STUCK_PARENT = { id: 'krista', organization_id: 'org1', org_role: 'parent' }

const renderApp = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <Routes>
      <Route element={<PrivateRoute />}>
        <Route path="/dashboard" element={<div>Parent Home</div>} />
      </Route>
      <Route path="/enroll/resume" element={<div>Registration Funnel</div>} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  vi.clearAllMocks()
  clearICreateRegistrationGate()
  authState = {
    isAuthenticated: true, loading: false, user: STUCK_PARENT, effectiveRole: 'parent',
  }
  api.get.mockResolvedValue({ data: { registration: { status: 'paperwork' } } })
})

describe('registration gate vs masquerade', () => {
  it('still locks the parent to the funnel on their own login', async () => {
    isMasquerading.mockReturnValue(false)
    renderApp()
    expect(await screen.findByText('Registration Funnel')).toBeInTheDocument()
  })

  it('lets a masquerading admin use the app as that parent', async () => {
    isMasquerading.mockReturnValue(true)
    renderApp()
    expect(await screen.findByText('Parent Home')).toBeInTheDocument()
  })
})
