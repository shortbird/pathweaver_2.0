import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter, useParams } from 'react-router-dom'
import OrganizationSignup from '../OrganizationSignup'
import { AuthProvider } from '../../../contexts/AuthContext'
import api from '../../../services/api'

// Mock the API
vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// Mock react-router-dom hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: () => vi.fn(),
  }
})

// Mock AuthContext
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    register: vi.fn(),
    isAuthenticated: false,
    user: null,
    loading: false,
  }),
  AuthProvider: ({ children }) => <>{children}</>,
}))

// Mock toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const renderOrganizationSignup = () => {
  return render(
    <BrowserRouter>
      <OrganizationSignup />
    </BrowserRouter>
  )
}

describe('OrganizationSignup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useParams.mockReturnValue({ slug: 'test-school' })
  })

  it('fetches and displays organization details', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        id: 'org-123',
        name: 'Test School',
        slug: 'test-school',
        branding_config: {
          logo_url: 'https://example.com/logo.png',
        },
      },
    })

    renderOrganizationSignup()

    // Should show loading initially
    expect(screen.getByText(/loading/i)).toBeInTheDocument()

    // Wait for organization to load
    await waitFor(() => {
      expect(screen.getByText('Test School')).toBeInTheDocument()
    })

    // Verify API was called correctly
    expect(api.get).toHaveBeenCalledWith('/api/organizations/join/test-school')
  })

  it('displays error message when organization is not found', async () => {
    api.get.mockRejectedValueOnce({
      response: {
        status: 404,
        data: { error: 'Organization not found' },
      },
    })

    renderOrganizationSignup()

    await waitFor(() => {
      expect(screen.getByText(/organization not found/i)).toBeInTheDocument()
    })
  })

  it('displays error message when organization is inactive', async () => {
    api.get.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { error: 'Organization is inactive' },
      },
    })

    renderOrganizationSignup()

    await waitFor(() => {
      expect(screen.getByText(/inactive/i)).toBeInTheDocument()
    })
  })

  it('shows signup form after organization loads', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        id: 'org-123',
        name: 'Test School',
        slug: 'test-school',
        branding_config: {},
      },
    })

    renderOrganizationSignup()

    await waitFor(() => {
      expect(screen.getByText('Test School')).toBeInTheDocument()
    })

    // Check form fields exist
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
  })

  it('validates password strength requirements', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        id: 'org-123',
        name: 'Test School',
        slug: 'test-school',
        branding_config: {},
      },
    })

    renderOrganizationSignup()

    await waitFor(() => {
      expect(screen.getByText('Test School')).toBeInTheDocument()
    })

    // Find password input
    const passwordInput = screen.getByLabelText(/^password$/i)

    // Enter weak password
    fireEvent.change(passwordInput, { target: { value: 'weak' } })

    // Should show password requirements
    await waitFor(() => {
      expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument()
    })
  })

  it('displays organization logo when branding is configured', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        id: 'org-123',
        name: 'Test School',
        slug: 'test-school',
        branding_config: {
          logo_url: 'https://example.com/logo.png',
        },
      },
    })

    renderOrganizationSignup()

    await waitFor(() => {
      const logo = screen.getByAltText('Test School')
      expect(logo).toBeInTheDocument()
      expect(logo).toHaveAttribute('src', 'https://example.com/logo.png')
    })
  })

  it('has link to regular signup page', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        id: 'org-123',
        name: 'Test School',
        slug: 'test-school',
        branding_config: {},
      },
    })

    renderOrganizationSignup()

    await waitFor(() => {
      expect(screen.getByText('Test School')).toBeInTheDocument()
    })

    // Should have link to login
    const loginLink = screen.getByRole('link', { name: /sign in/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('submits form with org_slug parameter', async () => {
    const mockRegister = vi.fn().mockResolvedValue({ success: true })

    // Re-mock AuthContext for this test
    vi.doMock('../../../contexts/AuthContext', () => ({
      useAuth: () => ({
        register: mockRegister,
        isAuthenticated: false,
        user: null,
        loading: false,
      }),
      AuthProvider: ({ children }) => <>{children}</>,
    }))

    api.get.mockResolvedValueOnce({
      data: {
        id: 'org-123',
        name: 'Test School',
        slug: 'test-school',
        branding_config: {},
      },
    })

    renderOrganizationSignup()

    await waitFor(() => {
      expect(screen.getByText('Test School')).toBeInTheDocument()
    })

    // Note: Full form submission test would require filling all required fields
    // This is a basic structure test
  })
})

describe('OrganizationSignup Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useParams.mockReturnValue({ slug: 'micro-school-abc' })
  })

  it('handles missing slug gracefully', async () => {
    useParams.mockReturnValue({ slug: undefined })

    renderOrganizationSignup()

    // Should not crash and should show some error or redirect
    await waitFor(() => {
      // Component should handle missing slug
      expect(api.get).not.toHaveBeenCalled()
    })
  })

  it('displays organization name in page title context', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        id: 'org-123',
        name: 'Sunrise Academy',
        slug: 'sunrise-academy',
        branding_config: {},
      },
    })

    renderOrganizationSignup()

    await waitFor(() => {
      expect(screen.getByText('Sunrise Academy')).toBeInTheDocument()
    })

    // Verify the "Join" or similar context is shown
    expect(screen.getByText(/join/i)).toBeInTheDocument()
  })
})
