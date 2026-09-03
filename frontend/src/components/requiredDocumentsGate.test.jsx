import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PrivateRoute from './PrivateRoute'
import { clearRequiredDocumentsGate } from '../hooks/useRequiredDocumentsGate'
import { clearRegistrationGate } from '../hooks/useRegistrationGate'

/**
 * The router half of the paperwork hold.
 *
 * iCreate, 2026-08-18: a school assigns a document to a family and blocks their
 * platform access until it is signed. The API enforces it
 * (backend/middleware/signature_gate.py); this is the part that puts the family
 * on the signing page instead of leaving them to discover a 403 behind every
 * link.
 *
 * The cases that matter are the ones where the two halves could disagree:
 * who is held, and who is emphatically not.
 */

let authState = {}
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../services/masqueradeService', () => ({ isMasquerading: () => false }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../services/api', () => ({ default: api }))

const PARENT = { id: 'p1', organization_id: 'org1', role: 'org_managed', org_role: 'parent' }

const renderApp = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <Routes>
      <Route element={<PrivateRoute />}>
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Route>
      <Route path="/family/required-documents" element={<div>Sign This</div>} />
      <Route path="/enroll/resume" element={<div>Registration Funnel</div>} />
      <Route path="/login" element={<div>Login</div>} />
    </Routes>
  </MemoryRouter>
)

// The gate shares PrivateRoute with the registration gate, so both lookups are
// answered here; `blocked` is the one under test.
const respond = ({ blocked = false, registration = null } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('required-documents')) return Promise.resolve({ data: { blocked } })
    return Promise.resolve({ data: { registration } })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  clearRequiredDocumentsGate()
  clearRegistrationGate()
  authState = { isAuthenticated: true, loading: false, user: PARENT, effectiveRole: 'parent' }
})

describe('Required documents gate', () => {
  it('sends a held family to the signing page', async () => {
    respond({ blocked: true })
    renderApp()
    expect(await screen.findByText('Sign This')).toBeInTheDocument()
  })

  it('lets them through once nothing is outstanding', async () => {
    respond({ blocked: false })
    renderApp()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('does not gate a user with no organization', async () => {
    // A platform family cannot be sent school paperwork, so they should not pay
    // for the lookup either.
    authState = {
      isAuthenticated: true, loading: false, effectiveRole: 'parent',
      user: { id: 'p2', organization_id: null, role: 'parent' },
    }
    respond({ blocked: true })
    renderApp()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('required-documents'))
  })

  it('fails open when the check itself fails', async () => {
    // A network blip must never be the thing that locks a family out — the
    // backend still holds the real line.
    api.get.mockRejectedValue(new Error('offline'))
    renderApp()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('leaves an unfinished registration in the funnel', async () => {
    // Registration collects its own paperwork. A family caught by both gates
    // belongs in the funnel, or neither is finishable.
    respond({ blocked: true, registration: { status: 'family' } })
    renderApp()
    expect(await screen.findByText('Registration Funnel')).toBeInTheDocument()
  })

  it('still bounces an unauthenticated visitor to login', async () => {
    authState = { isAuthenticated: false, loading: false, user: null, effectiveRole: null }
    respond({ blocked: true })
    renderApp()
    expect(await screen.findByText('Login')).toBeInTheDocument()
  })
})
