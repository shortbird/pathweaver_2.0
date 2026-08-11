import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginPage from './LoginPage'

// Mock useAuth - components import from '../contexts/AuthContext'
const mockLogin = vi.fn()
const mockNavigate = vi.fn()
let authState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../components/auth/GoogleButton', () => ({
  default: ({ mode, onError, disabled }) => (
    <button data-testid="google-button" disabled={disabled} onClick={() => {}}>
      {mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
    </button>
  )
}))

vi.mock('../services/api', () => ({
  observerAPI: {
    acceptInvitation: vi.fn()
  },
  default: {}
}))

function renderLoginPage(initialRoute = '/login') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    authState = {
      login: mockLogin,
      isAuthenticated: false,
      user: null,
      loading: false
    }
  })

  // --- Rendering ---
  describe('rendering', () => {
    it('renders welcome heading', () => {
      renderLoginPage()
      expect(screen.getByText('Welcome back')).toBeInTheDocument()
    })

    it('renders email input', () => {
      renderLoginPage()
      expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument()
    })

    it('renders password input', () => {
      renderLoginPage()
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    })

    it('renders sign in button', () => {
      renderLoginPage()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })

    it('renders Google sign-in button', () => {
      renderLoginPage()
      expect(screen.getByTestId('google-button')).toBeInTheDocument()
    })

    it('renders forgot password link', () => {
      renderLoginPage()
      expect(screen.getByText('Forgot your password?')).toBeInTheDocument()
    })

    it('renders create account link', () => {
      renderLoginPage()
      expect(screen.getByText('create a new account')).toBeInTheDocument()
    })
  })

  // --- Validation ---
  describe('validation', () => {
    it('shows error when email is empty on submit', async () => {
      renderLoginPage()
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument()
      })
    })

    it('shows error when password is empty on submit', async () => {
      renderLoginPage()
      fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'test@example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument()
      })
    })
  })

  // --- Password visibility toggle ---
  describe('password visibility', () => {
    it('password field starts as type="password"', () => {
      renderLoginPage()
      expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password')
    })

    it('toggles to type="text" when show button clicked', async () => {
      renderLoginPage()
      const toggleBtn = screen.getByLabelText('Show password')
      fireEvent.click(toggleBtn)
      expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'text')
    })

    it('toggles back to type="password" on second click', async () => {
      renderLoginPage()
      const toggleBtn = screen.getByLabelText('Show password')
      fireEvent.click(toggleBtn)
      const hideBtn = screen.getByLabelText('Hide password')
      fireEvent.click(hideBtn)
      expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password')
    })
  })

  // --- Login flow ---
  describe('login flow', () => {
    it('calls login with email and password on submit', async () => {
      mockLogin.mockResolvedValue({ success: true })
      renderLoginPage()

      fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'mypassword' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'mypassword')
      })
    })

    it('shows loading state during login', async () => {
      let resolveLogin
      mockLogin.mockReturnValue(new Promise(resolve => { resolveLogin = resolve }))
      renderLoginPage()

      fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(screen.getByText('Signing in...')).toBeInTheDocument()
      })

      resolveLogin({ success: true })
    })

    it('disables submit button during login', async () => {
      let resolveLogin
      mockLogin.mockReturnValue(new Promise(resolve => { resolveLogin = resolve }))
      renderLoginPage()

      fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pass' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(screen.getByText('Signing in...').closest('button')).toBeDisabled()
      })

      resolveLogin({ success: true })
    })
  })

  // --- Error handling ---
  describe('error handling', () => {
    it('displays login error message', async () => {
      mockLogin.mockResolvedValue({ success: false, error: 'Invalid credentials' })
      renderLoginPage()

      fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      })
    })

    it('shows default error when no message provided', async () => {
      mockLogin.mockResolvedValue({ success: false })
      renderLoginPage()

      fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(screen.getByText('Login failed. Please try again.')).toBeInTheDocument()
      })
    })

    it('clears error on new submission attempt', async () => {
      mockLogin
        .mockResolvedValueOnce({ success: false, error: 'First error' })
        .mockResolvedValueOnce({ success: true })
      renderLoginPage()

      fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'user@test.com' } })
      fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument()
      })

      // Submit again
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument()
      })
    })
  })

  // --- Already authenticated ---
  // A signed-in user landing on /login goes straight to their app home. The
  // "Continue as / switch account" interstitial is reserved for the one case it
  // was built for: a DIFFERENT account signed in from another tab (detected via
  // the session_sync record AuthContext writes on every login).
  describe('already authenticated, no other account elsewhere', () => {
    beforeEach(() => {
      authState = {
        login: mockLogin,
        isAuthenticated: true,
        user: { id: '1', role: 'student', first_name: 'Alice' },
        effectiveRole: 'student',
        loading: false
      }
    })

    it('forwards a student to the dashboard without showing the interstitial', async () => {
      renderLoginPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      })
      expect(screen.queryByText(/You are logged in as/)).not.toBeInTheDocument()
      expect(screen.queryByText('Welcome back')).not.toBeInTheDocument()
    })

    it('still forwards when the latest cross-tab login is this same account', async () => {
      localStorage.setItem('session_sync', JSON.stringify({ userId: '1', action: 'login', timestamp: 1 }))
      renderLoginPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      })
    })

    it('forwards a parent to the role home (/dashboard)', async () => {
      authState = { ...authState, user: { id: '1', role: 'parent', first_name: 'Bob' }, effectiveRole: 'parent' }
      renderLoginPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      })
    })

    it('honors a return path from a protected page', async () => {
      renderLoginPage({ pathname: '/login', state: { from: '/quests/42' } })

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/quests/42', { replace: true })
      })
    })
  })

  describe('another account signed in from a different tab', () => {
    beforeEach(() => {
      localStorage.setItem('session_sync', JSON.stringify({ userId: 'other-user', action: 'login', timestamp: 1 }))
      authState = {
        login: mockLogin,
        isAuthenticated: true,
        user: { id: '1', role: 'student', first_name: 'Alice' },
        effectiveRole: 'student',
        loading: false
      }
    })

    it('shows the account interstitial instead of auto-forwarding', async () => {
      renderLoginPage()

      expect(await screen.findByText(/You are logged in as/)).toBeInTheDocument()
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Continue as Alice')).toBeInTheDocument()
      expect(screen.getByText('Sign in with a different account')).toBeInTheDocument()
      expect(screen.getByText(/Signing in as a different account will end your current session/)).toBeInTheDocument()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('navigates to dashboard when Continue is clicked (student)', async () => {
      renderLoginPage()

      fireEvent.click(await screen.findByText('Continue as Alice'))
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('navigates to parent dashboard when Continue is clicked (org-managed parent)', async () => {
      authState = {
        ...authState,
        // Org parents have role 'org_managed'; effectiveRole resolves org_role
        user: { id: '1', role: 'org_managed', org_role: 'parent', first_name: 'Bob' },
        effectiveRole: 'parent'
      }
      renderLoginPage()

      fireEvent.click(await screen.findByText('Continue as Bob'))
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('navigates observer straight to the feed when Continue is clicked', async () => {
      localStorage.removeItem('observerWelcomeSeen')
      authState = {
        ...authState,
        user: { id: '1', role: 'observer', first_name: 'Carol' },
        effectiveRole: 'observer'
      }
      renderLoginPage()

      fireEvent.click(await screen.findByText('Continue as Carol'))
      expect(mockNavigate).toHaveBeenCalledWith('/observer/feed')
    })

    it('navigates returning observer to feed when Continue is clicked', async () => {
      localStorage.setItem('observerWelcomeSeen', 'true')
      authState = {
        ...authState,
        user: { id: '1', role: 'observer', first_name: 'Carol' },
        effectiveRole: 'observer'
      }
      renderLoginPage()

      fireEvent.click(await screen.findByText('Continue as Carol'))
      expect(mockNavigate).toHaveBeenCalledWith('/observer/feed')
    })

    it('shows login form when switch account is clicked', async () => {
      renderLoginPage()

      fireEvent.click(await screen.findByText('Sign in with a different account'))

      await waitFor(() => {
        expect(screen.getByText('Welcome back')).toBeInTheDocument()
        expect(screen.getByText(/Signing in below will end your current session/)).toBeInTheDocument()
      })
    })
  })

  // --- Observer invitation ---
  describe('observer invitation flow', () => {
    it('stores invitation code from URL in localStorage', () => {
      renderLoginPage('/login?invitation=abc123')

      expect(localStorage.getItem('pendingObserverInvitation')).toBe('abc123')
    })

    it('accepts pending invitation on authenticated redirect', async () => {
      localStorage.setItem('pendingObserverInvitation', 'invite-code')
      const { observerAPI } = await import('../services/api')
      observerAPI.acceptInvitation.mockResolvedValue({
        data: { status: 'success' }
      })

      authState = {
        login: mockLogin,
        isAuthenticated: true,
        user: { id: '1', role: 'student', first_name: 'Test' },
        effectiveRole: 'student',
        loading: false
      }
      renderLoginPage()

      await waitFor(() => {
        expect(observerAPI.acceptInvitation).toHaveBeenCalledWith('invite-code', {})
      })

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/observer/welcome', expect.objectContaining({ replace: true }))
      })
    })
  })
})
