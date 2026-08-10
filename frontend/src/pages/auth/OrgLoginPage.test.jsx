import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import OrgLoginPage from './OrgLoginPage'

const mockLoginWithUsername = vi.fn()
const mockNavigate = vi.fn()
let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('../../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { name: 'Test Org', branding_config: {} } })) }
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login/test-org']}>
      <Routes>
        <Route path="/login/:slug" element={<OrgLoginPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// Same contract as LoginPage: signed-in visitors go straight to their app home;
// the "Continue as / switch" interstitial appears only when a different account
// signed in from another tab (session_sync mismatch).
describe('OrgLoginPage when already authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    authState = {
      loginWithUsername: mockLoginWithUsername,
      isAuthenticated: true,
      user: { id: '1', role: 'org_managed', org_role: 'student', first_name: 'Sam' },
      loading: false
    }
  })

  it('forwards straight to the app home when no other account is active elsewhere', async () => {
    renderPage()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })
    expect(screen.queryByText(/You are logged in as/)).not.toBeInTheDocument()
  })

  it('shows the interstitial when a different account signed in from another tab', async () => {
    localStorage.setItem('session_sync', JSON.stringify({ userId: 'other', action: 'login', timestamp: 1 }))
    renderPage()
    expect(await screen.findByText(/You are logged in as/)).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('Continue sends an org-managed parent to the parent dashboard', async () => {
    localStorage.setItem('session_sync', JSON.stringify({ userId: 'other', action: 'login', timestamp: 1 }))
    authState = {
      ...authState,
      user: { id: '1', role: 'org_managed', org_role: 'parent', first_name: 'Pat' }
    }
    renderPage()
    fireEvent.click(await screen.findByText('Continue as Pat'))
    expect(mockNavigate).toHaveBeenCalledWith('/parent/dashboard')
  })
})
