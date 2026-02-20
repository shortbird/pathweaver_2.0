import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RegisterPage from './RegisterPage'

const mockRegister = vi.fn()
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

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../components/auth/GoogleButton', () => ({
  default: ({ mode, onError, disabled }) => (
    <button data-testid="google-button" disabled={disabled}>
      {mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
    </button>
  )
}))

vi.mock('../components/auth/PasswordStrengthMeter', () => ({
  default: ({ password }) => password ? <div data-testid="password-strength">Strength meter</div> : null
}))

vi.mock('../services/api', () => ({
  default: {
    post: vi.fn()
  }
}))

function renderRegisterPage(initialRoute = '/register') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    authState = {
      register: mockRegister,
      isAuthenticated: false,
      user: null,
      loading: false
    }
  })

  // --- Rendering ---
  describe('rendering', () => {
    it('renders heading', () => {
      renderRegisterPage()
      expect(screen.getByText('Create your account')).toBeInTheDocument()
    })

    it('renders first name field', () => {
      renderRegisterPage()
      expect(screen.getByLabelText('First Name')).toBeInTheDocument()
    })

    it('renders last name field', () => {
      renderRegisterPage()
      expect(screen.getByLabelText('Last Name')).toBeInTheDocument()
    })

    it('renders email field', () => {
      renderRegisterPage()
      expect(screen.getByLabelText('Email Address')).toBeInTheDocument()
    })

    it('renders date of birth field', () => {
      renderRegisterPage()
      expect(screen.getByLabelText('Date of Birth')).toBeInTheDocument()
    })

    it('renders password field', () => {
      renderRegisterPage()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
    })

    it('renders confirm password field', () => {
      renderRegisterPage()
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
    })

    it('renders Google signup button', () => {
      renderRegisterPage()
      expect(screen.getByTestId('google-button')).toBeInTheDocument()
    })

    it('renders login link', () => {
      renderRegisterPage()
      expect(screen.getByText('sign in to your existing account')).toBeInTheDocument()
    })

    it('renders legal terms checkbox', () => {
      renderRegisterPage()
      expect(screen.getByLabelText(/I agree to the/)).toBeInTheDocument()
    })

    it('renders portfolio visibility checkbox', () => {
      renderRegisterPage()
      expect(screen.getByLabelText(/I understand that my learning portfolio/)).toBeInTheDocument()
    })

    it('renders submit button', () => {
      renderRegisterPage()
      expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
    })
  })

  // --- Required field validation ---
  describe('validation', () => {
    it('shows error when first name is empty', async () => {
      renderRegisterPage()
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('First name is required')).toBeInTheDocument()
      })
    })

    it('shows error when last name is empty', async () => {
      renderRegisterPage()
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('Last name is required')).toBeInTheDocument()
      })
    })

    it('shows error when email is empty', async () => {
      renderRegisterPage()
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument()
      })
    })

    it('shows error when date of birth is empty', async () => {
      renderRegisterPage()
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('Date of birth is required for age verification')).toBeInTheDocument()
      })
    })

    it('shows error when password is empty', async () => {
      renderRegisterPage()
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument()
      })
    })

    it('shows error when confirm password is empty', async () => {
      renderRegisterPage()
      // Fill password but not confirm
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'MyStr0ng!Pass#2024' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('Please confirm your password')).toBeInTheDocument()
      })
    })

    it('shows error when legal terms not checked', async () => {
      renderRegisterPage()
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('You must accept the Terms of Service and Privacy Policy')).toBeInTheDocument()
      })
    })

    it('shows error when portfolio visibility not checked', async () => {
      renderRegisterPage()
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('You must acknowledge that your learning portfolio will be publicly visible')).toBeInTheDocument()
      })
    })
  })

  // --- Password validation ---
  describe('password validation', () => {
    it('shows password strength meter when password entered', async () => {
      renderRegisterPage()
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc' } })

      await waitFor(() => {
        expect(screen.getByTestId('password-strength')).toBeInTheDocument()
      })
    })

    it('shows error for password confirm mismatch', async () => {
      renderRegisterPage()
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'MyStr0ng!Pass#2024' } })
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'DifferentPass!' } })

      // Fill required fields to get past other validations
      fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'John' } })
      fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Doe' } })
      fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'test@test.com' } })
      fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '2000-01-01' } })
      fireEvent.click(screen.getByLabelText(/I agree to the/))
      fireEvent.click(screen.getByLabelText(/I understand that my learning portfolio/))
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
      })
    })
  })

  // --- Password visibility toggles ---
  describe('password visibility', () => {
    it('toggles password visibility', () => {
      renderRegisterPage()
      const passwordInput = screen.getByLabelText('Password')
      expect(passwordInput).toHaveAttribute('type', 'password')

      const toggleButtons = screen.getAllByLabelText('Show password')
      fireEvent.click(toggleButtons[0])
      expect(passwordInput).toHaveAttribute('type', 'text')
    })

    it('toggles confirm password visibility', () => {
      renderRegisterPage()
      const confirmInput = screen.getByLabelText('Confirm Password')
      expect(confirmInput).toHaveAttribute('type', 'password')

      const toggleButtons = screen.getAllByLabelText('Show password')
      fireEvent.click(toggleButtons[1])
      expect(confirmInput).toHaveAttribute('type', 'text')
    })
  })

  // --- COPPA (under 13) ---
  describe('COPPA compliance', () => {
    it('shows under-13 warning when date of birth indicates minor', async () => {
      renderRegisterPage()
      // Set date to make user 10 years old
      const tenYearsAgo = new Date()
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
      const dateStr = tenYearsAgo.toISOString().split('T')[0]

      fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: dateStr } })

      await waitFor(() => {
        expect(screen.getByText('Parent Account Required')).toBeInTheDocument()
      })
    })

    it('disables submit when under 13', async () => {
      renderRegisterPage()
      const tenYearsAgo = new Date()
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
      const dateStr = tenYearsAgo.toISOString().split('T')[0]

      fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: dateStr } })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Parent account required' })).toBeDisabled()
      })
    })

    it('does not show warning for users 13+', async () => {
      renderRegisterPage()
      const fifteenYearsAgo = new Date()
      fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15)
      const dateStr = fifteenYearsAgo.toISOString().split('T')[0]

      fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: dateStr } })

      await waitFor(() => {
        expect(screen.queryByText('Parent Account Required')).not.toBeInTheDocument()
      })
    })
  })

  // --- Happy path ---
  describe('registration flow', () => {
    it('calls register with form data on valid submit', async () => {
      mockRegister.mockResolvedValue({ success: true })
      renderRegisterPage()

      fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Jane' } })
      fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Doe' } })
      fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'jane@example.com' } })

      const twentyYearsAgo = new Date()
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20)
      fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: twentyYearsAgo.toISOString().split('T')[0] } })

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'MyStr0ng!Pass#2024' } })
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'MyStr0ng!Pass#2024' } })
      fireEvent.click(screen.getByLabelText(/I agree to the/))
      fireEvent.click(screen.getByLabelText(/I understand that my learning portfolio/))
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'jane@example.com',
          password: 'MyStr0ng!Pass#2024'
        }))
      })
    })

    it('shows loading state during registration', async () => {
      let resolveRegister
      mockRegister.mockReturnValue(new Promise(resolve => { resolveRegister = resolve }))
      renderRegisterPage()

      fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Jane' } })
      fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Doe' } })
      fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'jane@example.com' } })

      const twentyYearsAgo = new Date()
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20)
      fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: twentyYearsAgo.toISOString().split('T')[0] } })

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'MyStr0ng!Pass#2024' } })
      fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'MyStr0ng!Pass#2024' } })
      fireEvent.click(screen.getByLabelText(/I agree to the/))
      fireEvent.click(screen.getByLabelText(/I understand that my learning portfolio/))
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Creating account...' })).toBeDisabled()
      })

      resolveRegister({ success: true })
    })
  })

  // --- Auth redirect ---
  describe('redirect when already authenticated', () => {
    it('redirects student to /dashboard', async () => {
      authState = {
        register: mockRegister,
        isAuthenticated: true,
        user: { id: '1', role: 'student' },
        loading: false
      }
      renderRegisterPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      })
    })

    it('redirects parent to /parent/dashboard', async () => {
      authState = {
        register: mockRegister,
        isAuthenticated: true,
        user: { id: '1', role: 'parent' },
        loading: false
      }
      renderRegisterPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/parent/dashboard', { replace: true })
      })
    })

    it('redirects observer to /observer/feed', async () => {
      authState = {
        register: mockRegister,
        isAuthenticated: true,
        user: { id: '1', role: 'observer' },
        loading: false
      }
      renderRegisterPage()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/observer/feed', { replace: true })
      })
    })
  })

  // --- Observer registration ---
  describe('observer registration', () => {
    it('shows observer banner when invitation code in URL', () => {
      renderRegisterPage('/register?invitation=obs-code-123')
      expect(screen.getByText('Creating Observer Account')).toBeInTheDocument()
    })

    it('shows observer heading when invitation code present', () => {
      renderRegisterPage('/register?invitation=obs-code-123')
      expect(screen.getByText('Create your observer account')).toBeInTheDocument()
    })
  })
})
