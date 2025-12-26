import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, createMockUser } from '../tests/test-utils'
import RegisterPage from './RegisterPage'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock the useAuth hook
let mockAuthValue = {
  user: null,
  isAuthenticated: false,
  loading: false,
  register: vi.fn(),
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}))

// Mock logger
vi.mock('../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
  }
}))

// Mock PasswordStrengthMeter component
vi.mock('../components/auth/PasswordStrengthMeter', () => ({
  default: ({ password }) => (
    <div data-testid="password-strength-meter">
      {password ? 'Strength meter visible' : 'No password'}
    </div>
  )
}))

describe('RegisterPage', () => {
  const mockRegister = vi.fn()

  // Helper to fill valid form data (all fields except the one being tested)
  const fillValidFormData = async (user, { skipField = null } = {}) => {
    const today = new Date()
    const twentyYearsAgo = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate())
    const dobString = twentyYearsAgo.toISOString().split('T')[0]

    if (skipField !== 'first_name') {
      await user.type(screen.getByPlaceholderText(/^john$/i), 'John')
    }
    if (skipField !== 'last_name') {
      await user.type(screen.getByPlaceholderText(/^doe$/i), 'Doe')
    }
    if (skipField !== 'email') {
      await user.type(screen.getByPlaceholderText(/john@example.com/i), 'john@example.com')
    }
    if (skipField !== 'date_of_birth') {
      await user.type(screen.getByLabelText(/date of birth/i), dobString)
    }
    if (skipField !== 'password') {
      await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
    }
    if (skipField !== 'confirmPassword') {
      await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass123!')
    }
    if (skipField !== 'acceptedLegalTerms') {
      await user.click(screen.getByRole('checkbox', { name: /i agree to the terms of service and privacy policy/i }))
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Update mockAuthValue for each test
    mockAuthValue.register = mockRegister
    mockAuthValue.user = null
    mockAuthValue.isAuthenticated = false
    mockAuthValue.loading = false
  })

  describe('Rendering', () => {
    it('renders registration form with all fields', () => {
      renderWithProviders(<RegisterPage />)

      expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/^john$/i)).toBeInTheDocument() // First name (exact match)
      expect(screen.getByPlaceholderText(/^doe$/i)).toBeInTheDocument() // Last name
      expect(screen.getByPlaceholderText(/john@example.com/i)).toBeInTheDocument() // Email
      expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })

    it('renders link to login page', () => {
      renderWithProviders(<RegisterPage />)

      const loginLink = screen.getByRole('link', { name: /sign in to your existing account/i })
      expect(loginLink).toBeInTheDocument()
      expect(loginLink).toHaveAttribute('href', '/login')
    })

    it('shows password strength meter', () => {
      renderWithProviders(<RegisterPage />)

      expect(screen.getByTestId('password-strength-meter')).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('shows error when first name is empty', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/first name is required/i)).toBeInTheDocument()
      })
    })

    it('shows error when last name is empty', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/last name is required/i)).toBeInTheDocument()
      })
    })

    it('shows error when email is empty', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument()
      })
    })

    it('shows error for invalid email format', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Fill required fields with valid data except email
      await user.type(screen.getByPlaceholderText(/^john$/i), 'John')
      await user.type(screen.getByPlaceholderText(/^doe$/i), 'Doe')

      // Fill email with invalid format
      const emailInput = screen.getByPlaceholderText(/john@example.com/i)
      await user.type(emailInput, 'invalid-email')

      const today = new Date()
      const twentyYearsAgo = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate())
      const dobString = twentyYearsAgo.toISOString().split('T')[0]
      await user.type(screen.getByLabelText(/date of birth/i), dobString)

      await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
      await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass123!')
      await user.click(screen.getByRole('checkbox'))

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/invalid email address/i)).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('shows error when date of birth is empty', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/date of birth is required/i)).toBeInTheDocument()
      })
    })

    it('shows error when password is too short', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Fill all required fields
      await user.type(screen.getByPlaceholderText(/^john$/i), 'John')
      await user.type(screen.getByPlaceholderText(/^doe$/i), 'Doe')
      await user.type(screen.getByPlaceholderText(/john@example.com/i), 'john@example.com')

      const today = new Date()
      const twentyYearsAgo = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate())
      const dobString = twentyYearsAgo.toISOString().split('T')[0]
      await user.type(screen.getByLabelText(/date of birth/i), dobString)

      // Fill password with too short value
      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.type(passwordInput, 'short')
      await user.type(screen.getByLabelText(/confirm password/i), 'short')
      await user.click(screen.getByRole('checkbox'))

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        // Look for the error message in the red text (not the helper text)
        const errorMessages = screen.queryAllByText(/password must be at least 12 characters/i)
        expect(errorMessages.length).toBeGreaterThan(0)
      }, { timeout: 3000 })
    })

    it('shows error when password lacks uppercase letter', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Fill all required fields
      await user.type(screen.getByPlaceholderText(/^john$/i), 'John')
      await user.type(screen.getByPlaceholderText(/^doe$/i), 'Doe')
      await user.type(screen.getByPlaceholderText(/john@example.com/i), 'john@example.com')

      const today = new Date()
      const twentyYearsAgo = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate())
      const dobString = twentyYearsAgo.toISOString().split('T')[0]
      await user.type(screen.getByLabelText(/date of birth/i), dobString)

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.type(passwordInput, 'lowercase123!')
      await user.type(screen.getByLabelText(/confirm password/i), 'lowercase123!')
      await user.click(screen.getByRole('checkbox'))

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        // The error format is "Password must contain: One uppercase letter"
        expect(screen.getByText(/password must contain.*uppercase/i)).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('shows error when password lacks number', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Fill all required fields
      await user.type(screen.getByPlaceholderText(/^john$/i), 'John')
      await user.type(screen.getByPlaceholderText(/^doe$/i), 'Doe')
      await user.type(screen.getByPlaceholderText(/john@example.com/i), 'john@example.com')

      const today = new Date()
      const twentyYearsAgo = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate())
      const dobString = twentyYearsAgo.toISOString().split('T')[0]
      await user.type(screen.getByLabelText(/date of birth/i), dobString)

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.type(passwordInput, 'NoNumbers!')
      await user.type(screen.getByLabelText(/confirm password/i), 'NoNumbers!')
      await user.click(screen.getByRole('checkbox'))

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        // The error format is "Password must contain: One number"
        expect(screen.getByText(/password must contain.*number/i)).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('shows error when password lacks special character', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Fill all fields except password and confirmPassword
      await fillValidFormData(user, { skipField: 'password' })

      const passwordInput = screen.getByLabelText(/^password$/i)
      await user.clear(screen.getByLabelText(/confirm password/i))
      await user.type(passwordInput, 'NoSpecial123')
      await user.type(screen.getByLabelText(/confirm password/i), 'NoSpecial123!')

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/one special character/i)).toBeInTheDocument()
      })
    })

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Fill all fields except confirmPassword
      await fillValidFormData(user, { skipField: 'confirmPassword' })

      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)
      await user.type(confirmPasswordInput, 'DifferentPass123!')

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
      })
    })
  })

  describe('COPPA Compliance (Under 13)', () => {
    it('shows parent email field when user is under 13', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Calculate date for 12-year-old
      const today = new Date()
      const twelveYearsAgo = new Date(today.getFullYear() - 12, today.getMonth(), today.getDate())
      const dobString = twelveYearsAgo.toISOString().split('T')[0]

      const dobInput = screen.getByLabelText(/date of birth/i)
      await user.type(dobInput, dobString)

      await waitFor(() => {
        expect(screen.getByLabelText(/parent\/guardian email/i)).toBeInTheDocument()
        expect(screen.getByText(/users under 13 require parental consent/i)).toBeInTheDocument()
      })
    })

    it('hides parent email field when user is 13 or older', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Calculate date for 14-year-old
      const today = new Date()
      const fourteenYearsAgo = new Date(today.getFullYear() - 14, today.getMonth(), today.getDate())
      const dobString = fourteenYearsAgo.toISOString().split('T')[0]

      const dobInput = screen.getByLabelText(/date of birth/i)
      await user.type(dobInput, dobString)

      await waitFor(() => {
        expect(screen.queryByLabelText(/parent\/guardian email/i)).not.toBeInTheDocument()
      })
    })

    it('requires parent email for users under 13', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      // Fill all fields except parent_email
      const today = new Date()
      const twelveYearsAgo = new Date(today.getFullYear() - 12, today.getMonth(), today.getDate())
      const dobString = twelveYearsAgo.toISOString().split('T')[0]

      await user.type(screen.getByPlaceholderText(/^john$/i), 'John')
      await user.type(screen.getByPlaceholderText(/^doe$/i), 'Doe')
      await user.type(screen.getByPlaceholderText(/john@example.com/i), 'john@example.com')
      await user.type(screen.getByLabelText(/date of birth/i), dobString)

      // Wait for parent email field to appear
      await waitFor(() => {
        expect(screen.getByLabelText(/parent\/guardian email/i)).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
      await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass123!')
      await user.click(screen.getByRole('checkbox', { name: /i agree to the terms of service and privacy policy/i }))

      // Try to submit without parent email
      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/parent\/guardian email is required/i)).toBeInTheDocument()
      })
    })
  })

  describe('Password Visibility Toggle', () => {
    it('toggles password visibility', async () => {
      const user = userEvent.setup()

      renderWithProviders(<RegisterPage />)

      const passwordInput = screen.getByLabelText(/^password$/i)

      // Initially should be type="password"
      expect(passwordInput).toHaveAttribute('type', 'password')

      // Fill password to make toggle button more visible
      await user.type(passwordInput, 'Test')

      // Find and click toggle button (eye icon) - it's the button inside the password field container
      const toggleButtons = screen.getAllByRole('button')
      // Filter out the submit button
      const toggleButton = toggleButtons.find(btn =>
        btn !== screen.getByRole('button', { name: /create account/i })
      )

      if (toggleButton) {
        await user.click(toggleButton)
        expect(passwordInput).toHaveAttribute('type', 'text')

        await user.click(toggleButton)
        expect(passwordInput).toHaveAttribute('type', 'password')
      }
    })
  })

  describe('Registration Submission', () => {
    it('calls register with valid data', async () => {
      const user = userEvent.setup()
      mockRegister.mockResolvedValue({ success: true })

      renderWithProviders(<RegisterPage />)

      // Fill form with valid data
      await fillValidFormData(user)

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(
          expect.objectContaining({
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com',
            password: 'StrongPass123!',
          })
        )
      })
    })

    it('includes parent email for users under 13', async () => {
      const user = userEvent.setup()
      mockRegister.mockResolvedValue({ success: true })

      renderWithProviders(<RegisterPage />)

      // Fill form with valid data for under 13 user
      const today = new Date()
      const twelveYearsAgo = new Date(today.getFullYear() - 12, today.getMonth(), today.getDate())
      const dobString = twelveYearsAgo.toISOString().split('T')[0]

      await user.type(screen.getByPlaceholderText(/^john$/i), 'Johnny')
      await user.type(screen.getByPlaceholderText(/^doe$/i), 'Kid')
      await user.type(screen.getByPlaceholderText(/john@example.com/i), 'johnny@example.com')
      await user.type(screen.getByLabelText(/date of birth/i), dobString)

      // Wait for parent email field to appear
      await waitFor(() => {
        expect(screen.getByLabelText(/parent\/guardian email/i)).toBeInTheDocument()
      })

      // Fill parent email
      await user.type(screen.getByLabelText(/parent\/guardian email/i), 'parent@example.com')

      // Strong password
      await user.type(screen.getByLabelText(/^password$/i), 'StrongPass123!')
      await user.type(screen.getByLabelText(/confirm password/i), 'StrongPass123!')
      await user.click(screen.getByRole('checkbox', { name: /i agree to the terms of service and privacy policy/i }))

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(
          expect.objectContaining({
            first_name: 'Johnny',
            last_name: 'Kid',
            email: 'johnny@example.com',
            parent_email: 'parent@example.com',
            password: 'StrongPass123!',
          })
        )
      })
    })

    it('disables submit button while loading', async () => {
      const user = userEvent.setup()

      let resolveRegister
      mockRegister.mockImplementation(() => new Promise(resolve => {
        resolveRegister = resolve
      }))

      renderWithProviders(<RegisterPage />)

      // Fill all valid data
      await fillValidFormData(user)

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(submitButton).toBeDisabled()
      })

      resolveRegister({ success: true })

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled()
      })
    })
  })

  describe('Authentication Redirect', () => {
    it('redirects to dashboard when student is already authenticated', async () => {
      const mockStudent = createMockUser({ role: 'student' })

      // Set mockAuthValue BEFORE rendering
      mockAuthValue.isAuthenticated = true
      mockAuthValue.user = mockStudent
      mockAuthValue.loading = false

      renderWithProviders(<RegisterPage />)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
      })
    })

    it('redirects to parent dashboard when parent is already authenticated', async () => {
      const mockParent = createMockUser({ role: 'parent' })

      // Set mockAuthValue BEFORE rendering
      mockAuthValue.isAuthenticated = true
      mockAuthValue.user = mockParent
      mockAuthValue.loading = false

      renderWithProviders(<RegisterPage />)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/parent/dashboard', { replace: true })
      })
    })

    it('does not redirect when not authenticated', () => {
      renderWithProviders(<RegisterPage />)

      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('does not redirect while loading', () => {
      const mockUser = createMockUser()

      // Set mockAuthValue BEFORE rendering
      mockAuthValue.isAuthenticated = true
      mockAuthValue.user = mockUser
      mockAuthValue.loading = true // Still loading

      renderWithProviders(<RegisterPage />)

      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('handles form submission via Enter key', async () => {
      const user = userEvent.setup()
      mockRegister.mockResolvedValue({ success: true })

      renderWithProviders(<RegisterPage />)

      // Fill form with all valid data
      await fillValidFormData(user)

      // Press Enter
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalled()
      })
    })
  })
})
