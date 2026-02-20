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

  // --- Auth redirect ---
  describe('redirect when already authenticated', () => {
    it('redirects student to /dashboard', async () => {
      authState = {
        login: mockLogin,
        isAuthenticated: true,
        user: { id: '1', role: 'student' },
        loading: false
      }
      renderLoginPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      })
    })

    it('redirects parent to /parent/dashboard', async () => {
      authState = {
        login: mockLogin,
        isAuthenticated: true,
        user: { id: '1', role: 'parent' },
        loading: false
      }
      renderLoginPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/parent/dashboard', { replace: true })
      })
    })

    it('redirects observer to /observer/feed', async () => {
      authState = {
        login: mockLogin,
        isAuthenticated: true,
        user: { id: '1', role: 'observer' },
        loading: false
      }
      renderLoginPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/observer/feed', { replace: true })
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
        user: { id: '1', role: 'student' },
        loading: false
      }
      renderLoginPage()

      await waitFor(() => {
        expect(observerAPI.acceptInvitation).toHaveBeenCalledWith('invite-code', {})
      })

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/observer/feed', expect.objectContaining({ replace: true }))
      })
    })
  })
})
