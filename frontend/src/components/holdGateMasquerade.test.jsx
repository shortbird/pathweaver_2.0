import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PrivateRoute from './PrivateRoute'
import { clearRequiredDocumentsGate } from '../hooks/useRequiredDocumentsGate'
import { clearPhoneVerificationGate } from '../hooks/usePhoneVerificationGate'

// The two adult holds — unsigned school paperwork, and an unverified phone —
// against a masquerade session.
//
// 2026-08-22, production: an admin masqueraded as a parent who had both holds
// and was bounced between /verify-phone and /family/required-documents with no
// way out. Neither hold could be satisfied from a masquerade (you cannot type a
// code texted to somebody else's phone, or sign their paperwork for them), and
// the hold pages are standalone, so the app chrome carrying "exit masquerade"
// never rendered. Both halves are covered here.

let authState = {}
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../services/api', () => ({ default: api, tokenStore: {} }))

const { isMasquerading } = vi.hoisted(() => ({ isMasquerading: vi.fn() }))
vi.mock('../services/masqueradeService', () => ({ isMasquerading }))

const HELD_PARENT = { id: 'parent-1', organization_id: 'org1', org_role: 'parent' }

const renderApp = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <Routes>
      <Route element={<PrivateRoute />}>
        <Route path="/dashboard" element={<div>Parent Home</div>} />
      </Route>
      <Route path="/family/required-documents" element={<div>Sign Your Documents</div>} />
      <Route path="/verify-phone" element={<div>Verify Your Phone</div>} />
    </Routes>
  </MemoryRouter>
)

// Both holds on: the shape that produced the loop.
const bothHoldsOn = () => api.get.mockImplementation((url) => {
  if (url.includes('required-documents')) return Promise.resolve({ data: { blocked: true } })
  if (url.includes('phone-verification')) {
    return Promise.resolve({ data: { required: true, verified: false } })
  }
  return Promise.resolve({ data: {} })
})

beforeEach(() => {
  vi.clearAllMocks()
  clearRequiredDocumentsGate()
  clearPhoneVerificationGate()
  authState = {
    isAuthenticated: true, loading: false, user: HELD_PARENT, effectiveRole: 'parent',
  }
  bothHoldsOn()
})

describe('adult holds vs masquerade', () => {
  it('still holds the parent on their own login', async () => {
    isMasquerading.mockReturnValue(false)
    renderApp()
    expect(await screen.findByText('Sign Your Documents')).toBeInTheDocument()
  })

  it('lets a masquerading admin through both holds', async () => {
    // Not a convenience: an admin cannot finish either hold, so holding them is
    // a room with no door.
    isMasquerading.mockReturnValue(true)
    renderApp()
    expect(await screen.findByText('Parent Home')).toBeInTheDocument()
  })

  it('asks the hold endpoints nothing at all while masquerading', async () => {
    isMasquerading.mockReturnValue(true)
    renderApp()
    await screen.findByText('Parent Home')
    const asked = api.get.mock.calls.map(([u]) => u).join(' ')
    expect(asked).not.toContain('required-documents')
    expect(asked).not.toContain('phone-verification')
  })

  it('holds the phone-only parent on their own login', async () => {
    isMasquerading.mockReturnValue(false)
    api.get.mockImplementation((url) => {
      if (url.includes('required-documents')) return Promise.resolve({ data: { blocked: false } })
      if (url.includes('phone-verification')) {
        return Promise.resolve({ data: { required: true, verified: false } })
      }
      return Promise.resolve({ data: {} })
    })
    renderApp()
    expect(await screen.findByText('Verify Your Phone')).toBeInTheDocument()
  })

  it('lets a verified, paperwork-free parent straight through', async () => {
    isMasquerading.mockReturnValue(false)
    api.get.mockImplementation((url) => {
      if (url.includes('required-documents')) return Promise.resolve({ data: { blocked: false } })
      if (url.includes('phone-verification')) {
        return Promise.resolve({ data: { required: true, verified: true } })
      }
      return Promise.resolve({ data: {} })
    })
    renderApp()
    expect(await screen.findByText('Parent Home')).toBeInTheDocument()
  })

  it('a hold lookup that fails does not lock anyone out', async () => {
    isMasquerading.mockReturnValue(false)
    api.get.mockRejectedValue(new Error('network'))
    renderApp()
    expect(await screen.findByText('Parent Home')).toBeInTheDocument()
  })
})
