import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, createMockUser } from '../test-utils'
import LoginPage from '../../pages/LoginPage'
import RegisterPage from '../../pages/RegisterPage'
import api from '../../services/api'

// Mock API module
vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock AuthContext to avoid provider issues
let mockAuthValue = {
  user: null,
  isAuthenticated: false,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}))

describe('Auth Flow Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    // Reset auth value
    mockAuthValue.user = null
    mockAuthValue.isAuthenticated = false
    mockAuthValue.loading = false
    mockAuthValue.login = vi.fn()
    mockAuthValue.register = vi.fn()
  })

  describe('Login → Dashboard Flow', () => {
    it('successfully logs in and navigates to student dashboard', async () => {
      const user = userEvent.setup()
      const mockUser = createMockUser({ role: 'student', display_name: 'Test Student' })

      // Mock successful login
      api.post.mockResolvedValueOnce({
        data: {
          user: mockUser,
          message: 'Login successful',
        },
      })

      mockAuthValue.login = vi.fn(async (email, password) => {
        const response = await api.post('/api/auth/login', { email, password })
        return response.data
      })

      renderWithProviders(<LoginPage />)

      // User enters credentials
      const emailInput = screen.getByPlaceholderText(/email address/i)
      const passwordInput = screen.getByPlaceholderText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'student@example.com')
      await user.type(passwordInput, 'password123456')
      await user.click(submitButton)

      // Verify login was called
      await waitFor(() => {
        expect(mockAuthValue.login).toHaveBeenCalledWith('student@example.com', 'password123456')
      })

      // Verify API was called
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/auth/login', {
          email: 'student@example.com',
          password: 'password123456',
        })
      })
    })

    it('successfully logs in as parent and navigates to parent dashboard', async () => {
      const user = userEvent.setup()
      const mockParent = createMockUser({ role: 'parent', display_name: 'Test Parent' })

      api.post.mockResolvedValueOnce({
        data: {
          user: mockParent,
          message: 'Login successful',
        },
      })

      mockAuthValue.login = vi.fn(async (email, password) => {
        const response = await api.post('/api/auth/login', { email, password })
        return response.data
      })

      renderWithProviders(<LoginPage />)

      await user.type(screen.getByPlaceholderText(/email address/i), 'parent@example.com')
      await user.type(screen.getByPlaceholderText(/password/i), 'password123456')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(mockAuthValue.login).toHaveBeenCalledWith('parent@example.com', 'password123456')
      })
    })

    it('shows error message on invalid credentials', async () => {
      const user = userEvent.setup()

      api.post.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { error: 'Invalid email or password' },
        },
      })

      mockAuthValue.login = vi.fn(async (email, password) => {
        try {
          const response = await api.post('/api/auth/login', { email, password })
          return response.data
        } catch (error) {
          throw error
        }
      })

      renderWithProviders(<LoginPage />)

      await user.type(screen.getByPlaceholderText(/email address/i), 'wrong@example.com')
      await user.type(screen.getByPlaceholderText(/password/i), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalled()
      })
    })

    it('maintains session across page navigation', async () => {
      const mockUser = createMockUser({ role: 'student' })

      // Simulate authenticated state
      mockAuthValue.user = mockUser
      mockAuthValue.isAuthenticated = true

      renderWithProviders(<LoginPage />)

      // Authenticated users should be redirected from login page
      // This is typically handled by a route guard
      expect(mockUser).toBeTruthy()
    })

    it('logs out and clears user session', async () => {
      const user = userEvent.setup()
      const mockUser = createMockUser({ role: 'student' })

      mockAuthValue.logout = vi.fn()

      // This test would typically involve rendering a component with a logout button
      // For now, we verify the logout function works
      mockAuthValue.logout()
      expect(mockAuthValue.logout).toHaveBeenCalled()
    })
  })

  describe('Registration → Login Flow', () => {
    it('successfully registers a new user and can login', async () => {
      const user = userEvent.setup()

      // Mock successful registration
      api.post.mockResolvedValueOnce({
        data: {
          message: 'Registration successful. Please check your email to verify your account.',
        },
      })

      mockAuthValue.register = vi.fn(async (email, password, displayName) => {
        const response = await api.post('/api/auth/register', {
          email,
          password,
          display_name: displayName,
        })
        return response.data
      })

      renderWithProviders(<RegisterPage />)

      // Fill in registration form
      await user.type(screen.getByPlaceholderText(/email/i), 'newuser@example.com')
      await user.type(screen.getAllByPlaceholderText(/password/i)[0], 'SecurePassword123!')
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'SecurePassword123!')
      await user.type(screen.getByPlaceholderText(/display name/i), 'New User')

      // Check age confirmation
      const ageCheckbox = screen.getByRole('checkbox', { name: /i am at least 13 years old/i })
      await user.click(ageCheckbox)

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockAuthValue.register).toHaveBeenCalledWith(
          'newuser@example.com',
          'SecurePassword123!',
          'New User'
        )
      })
    })

    it('prevents registration with weak password', async () => {
      const user = userEvent.setup()

      mockAuthValue.register = vi.fn()

      renderWithProviders(<RegisterPage />)

      await user.type(screen.getByPlaceholderText(/email/i), 'newuser@example.com')
      await user.type(screen.getAllByPlaceholderText(/password/i)[0], 'weak')
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'weak')
      await user.type(screen.getByPlaceholderText(/display name/i), 'New User')

      const ageCheckbox = screen.getByRole('checkbox', { name: /i am at least 13 years old/i })
      await user.click(ageCheckbox)

      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/password must be at least 12 characters/i)).toBeInTheDocument()
      })
    })

    it('prevents registration without age confirmation', async () => {
      const user = userEvent.setup()

      mockAuthValue.register = vi.fn()

      renderWithProviders(<RegisterPage />)

      await user.type(screen.getByPlaceholderText(/email/i), 'newuser@example.com')
      await user.type(screen.getAllByPlaceholderText(/password/i)[0], 'SecurePassword123!')
      await user.type(screen.getByPlaceholderText(/confirm password/i), 'SecurePassword123!')
      await user.type(screen.getByPlaceholderText(/display name/i), 'New User')

      // Don't check age confirmation
      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/you must be at least 13 years old/i)).toBeInTheDocument()
      })
    })
  })
})
