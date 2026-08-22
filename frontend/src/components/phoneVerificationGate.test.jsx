import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PrivateRoute from './PrivateRoute'
import { clearPhoneVerificationGate } from '../hooks/usePhoneVerificationGate'
import { clearRequiredDocumentsGate } from '../hooks/useRequiredDocumentsGate'
import { clearICreateRegistrationGate } from '../hooks/useICreateRegistrationGate'

/**
 * The router half of the phone-verification hold.
 *
 * iCreate, 2026-08-21: an org can require every adult account to verify a
 * phone number by SMS code. The API enforces it
 * (backend/middleware/phone_verification_gate.py); this is the part that puts
 * the adult on the verification page instead of leaving them to discover a 403
 * behind every link. Same shape, and same cases, as the paperwork gate's test
 * directly beside this one.
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
      <Route path="/verify-phone" element={<div>Verify Phone</div>} />
      <Route path="/family/required-documents" element={<div>Sign This</div>} />
      <Route path="/enroll/resume" element={<div>Registration Funnel</div>} />
      <Route path="/login" element={<div>Login</div>} />
    </Routes>
  </MemoryRouter>
)

// PrivateRoute runs all three gates, so all three lookups are answered here;
// the phone status is the one under test.
const respond = ({ required = false, verified = false, docsBlocked = false,
                   registration = null } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('phone-verification')) {
      return Promise.resolve({ data: { required, verified } })
    }
    if (url.includes('required-documents')) {
      return Promise.resolve({ data: { blocked: docsBlocked } })
    }
    return Promise.resolve({ data: { registration } })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  clearPhoneVerificationGate()
  clearRequiredDocumentsGate()
  clearICreateRegistrationGate()
  authState = { isAuthenticated: true, loading: false, user: PARENT, effectiveRole: 'parent' }
})

describe('Phone verification gate', () => {
  it('sends a held adult to the verification page', async () => {
    respond({ required: true })
    renderApp()
    expect(await screen.findByText('Verify Phone')).toBeInTheDocument()
  })

  it('lets a verified adult through', async () => {
    respond({ required: true, verified: true })
    renderApp()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('lets everyone the org does not hold through', async () => {
    respond({ required: false })
    renderApp()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('does not gate a user with no organization', async () => {
    // Only orgs can require verification, so platform users should not pay
    // for the lookup either.
    authState = {
      isAuthenticated: true, loading: false, effectiveRole: 'parent',
      user: { id: 'p2', organization_id: null, role: 'parent' },
    }
    respond({ required: true })
    renderApp()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('phone-verification'))
  })

  it('fails open when the check itself fails', async () => {
    // A network blip must never be the thing that locks an adult out — the
    // backend still holds the real line.
    api.get.mockRejectedValue(new Error('offline'))
    renderApp()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('yields to unsigned required paperwork', async () => {
    // One redirect at a time: the paperwork hold outranks this one in
    // PrivateRoute, and both lift through their own pages.
    respond({ required: true, docsBlocked: true })
    renderApp()
    expect(await screen.findByText('Sign This')).toBeInTheDocument()
  })

  it('yields to an unfinished registration funnel', async () => {
    respond({ required: true, registration: { status: 'family' } })
    renderApp()
    expect(await screen.findByText('Registration Funnel')).toBeInTheDocument()
  })

  it('still bounces an unauthenticated visitor to login', async () => {
    authState = { isAuthenticated: false, loading: false, user: null, effectiveRole: null }
    respond({ required: true })
    renderApp()
    expect(await screen.findByText('Login')).toBeInTheDocument()
  })
})
