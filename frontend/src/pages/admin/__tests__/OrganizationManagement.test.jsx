import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import api from '../../../services/api'

vi.mock('../../../services/api')

// Mock OrganizationContext with refreshOrganization spy
const mockRefreshOrganization = vi.fn()
vi.mock('../../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({
    organization: { id: 'org-123', name: 'Test Org' },
    loading: false,
    refreshOrganization: mockRefreshOrganization
  })
}))

// Mock AuthContext
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123', organization_id: 'org-123', is_org_admin: true },
    isAuthenticated: true,
    loading: false
  })
}))

// Mock QuestVisibilityManager to simplify tests
vi.mock('../../../components/admin/QuestVisibilityManager', () => ({
  default: () => <div data-testid="quest-visibility-manager">Quest Visibility Manager</div>
}))

// Import after mocks
import OrganizationManagement from '../OrganizationManagement'

const mockOrgData = {
  organization: {
    id: 'org-123',
    name: 'Test Organization',
    slug: 'test-org',
    quest_visibility_policy: 'all_optio',
    is_active: true,
    branding_config: {
      logo_url: null
    }
  },
  users: [
    { id: 'u1', email: 'user1@test.com', first_name: 'John', last_name: 'Doe', role: 'student' },
    { id: 'u2', email: 'user2@test.com', first_name: 'Jane', last_name: 'Smith', role: 'advisor' }
  ],
  analytics: {
    total_users: 2,
    total_completions: 10,
    total_xp: 5000
  },
  curated_quests: []
}

const mockSettings = {
  settings: {
    site_name: 'Optio',
    logo_url: 'https://example.com/optio.png'
  }
}

const renderWithProviders = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  )
}

describe('OrganizationManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    api.get.mockImplementation((url) => {
      if (url.includes('/api/admin/organizations/')) {
        return Promise.resolve({ data: mockOrgData })
      }
      if (url === '/api/settings') {
        return Promise.resolve({ data: mockSettings })
      }
      if (url.includes('/api/admin/quests')) {
        return Promise.resolve({ data: { quests: [] } })
      }
      return Promise.reject(new Error(`Unknown URL: ${url}`))
    })

    api.put.mockResolvedValue({ data: { success: true } })
  })

  describe('Overview Tab', () => {
    it('renders organization details', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        // Use getAllByText since the name appears in both h1 and details section
        expect(screen.getAllByText('Test Organization').length).toBeGreaterThan(0)
      })

      expect(screen.getByText('test-org')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('shows registration URL with copy button', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText(/Registration URL/i)).toBeInTheDocument()
      })

      expect(screen.getByText('Copy URL')).toBeInTheDocument()
    })

    it('copies registration URL to clipboard', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
      Object.assign(navigator, { clipboard: mockClipboard })

      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Copy URL')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Copy URL'))

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining('/join/test-org')
        )
      })
    })
  })

  describe('Logo Management', () => {
    it('shows logo upload section', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Organization Logo')).toBeInTheDocument()
      })

      expect(screen.getByText('Upload Logo')).toBeInTheDocument()
      expect(screen.getByText(/PNG or SVG format, 2MB max/)).toBeInTheDocument()
    })

    it('calls refreshOrganization after logo upload', async () => {
      // Override FileReader to immediately trigger onload
      const originalFileReader = global.FileReader
      global.FileReader = class MockFileReader {
        constructor() {
          this.result = 'data:image/png;base64,test'
        }
        readAsDataURL() {
          // Immediately call onload
          Promise.resolve().then(() => {
            if (this.onload) this.onload()
          })
        }
      }

      try {
        renderWithProviders(<OrganizationManagement />)

        await waitFor(() => {
          expect(screen.getByText('Upload Logo')).toBeInTheDocument()
        })

        // Create a mock file
        const file = new File(['test'], 'logo.png', { type: 'image/png' })

        // Find the file input
        const fileInput = document.querySelector('input[type="file"]')

        // Trigger file selection
        fireEvent.change(fileInput, { target: { files: [file] } })

        await waitFor(() => {
          expect(api.put).toHaveBeenCalledWith(
            expect.stringContaining('/api/admin/organizations/'),
            expect.objectContaining({
              branding_config: expect.objectContaining({
                logo_url: 'data:image/png;base64,test'
              })
            })
          )
        }, { timeout: 3000 })

        await waitFor(() => {
          expect(mockRefreshOrganization).toHaveBeenCalled()
        })
      } finally {
        global.FileReader = originalFileReader
      }
    })

    it('calls refreshOrganization after logo removal', async () => {
      // Update mock to return org with logo
      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({
            data: {
              ...mockOrgData,
              organization: {
                ...mockOrgData.organization,
                branding_config: { logo_url: 'https://example.com/logo.png' }
              }
            }
          })
        }
        if (url === '/api/settings') {
          return Promise.resolve({ data: mockSettings })
        }
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      // Mock window.confirm
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Remove'))

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/organizations/'),
          expect.objectContaining({
            branding_config: expect.objectContaining({
              logo_url: null
            })
          })
        )
      })

      await waitFor(() => {
        expect(mockRefreshOrganization).toHaveBeenCalled()
      })
    })

    it('validates file size before upload', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Upload Logo')).toBeInTheDocument()
      })

      // Create a file larger than 2MB
      const largeFile = new File(['x'.repeat(3 * 1024 * 1024)], 'large.png', { type: 'image/png' })
      Object.defineProperty(largeFile, 'size', { value: 3 * 1024 * 1024 })

      const fileInput = document.querySelector('input[type="file"]')
      fireEvent.change(fileInput, { target: { files: [largeFile] } })

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Image must be less than 2MB')
      })

      alertSpy.mockRestore()
    })

    it('validates file type before upload', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Upload Logo')).toBeInTheDocument()
      })

      // Create a non-image file
      const textFile = new File(['test'], 'test.txt', { type: 'text/plain' })

      const fileInput = document.querySelector('input[type="file"]')
      fireEvent.change(fileInput, { target: { files: [textFile] } })

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Please select an image file')
      })

      alertSpy.mockRestore()
    })
  })

  describe('Users Tab', () => {
    it('shows users list with correct data', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Users')).toBeInTheDocument()
      })

      // Click Users tab
      fireEvent.click(screen.getByText('Users'))

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })
    })

    it('filters users by search term', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Users')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Users'))

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search users...')
      fireEvent.change(searchInput, { target: { value: 'Jane' } })

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })
    })

    it('filters users by role', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Users')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Users'))

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })

      // Filter by advisor role
      const roleSelect = screen.getByDisplayValue('All Roles')
      fireEvent.change(roleSelect, { target: { value: 'advisor' } })

      await waitFor(() => {
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      })
    })
  })

  describe('Quests Tab', () => {
    it('shows quest visibility policy', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Quests')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Quests'))

      await waitFor(() => {
        expect(screen.getByText(/Visibility Policy/i)).toBeInTheDocument()
        expect(screen.getByText(/All Optio \+ Org Quests/i)).toBeInTheDocument()
      })
    })

    it('allows changing quest visibility policy', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Quests')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Quests'))

      await waitFor(() => {
        expect(screen.getByText('Change')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Change'))

      await waitFor(() => {
        expect(screen.getByText('Org Quests Only')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Org Quests Only'))

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/organizations/'),
          expect.objectContaining({
            quest_visibility_policy: 'private_only'
          })
        )
      })
    })
  })

  describe('Edit Organization Modal', () => {
    it('opens edit modal and updates organization', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Edit'))

      await waitFor(() => {
        expect(screen.getByText('Edit Organization')).toBeInTheDocument()
      })

      // Change name
      const nameInput = screen.getByDisplayValue('Test Organization')
      fireEvent.change(nameInput, { target: { value: 'Updated Organization' } })

      // Submit
      fireEvent.click(screen.getByText('Save Changes'))

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/organizations/'),
          expect.objectContaining({
            name: 'Updated Organization'
          })
        )
      })
    })
  })

  describe('Statistics', () => {
    it('displays organization statistics', async () => {
      renderWithProviders(<OrganizationManagement />)

      await waitFor(() => {
        expect(screen.getByText('Total Users')).toBeInTheDocument()
      })

      expect(screen.getByText('2')).toBeInTheDocument() // total_users
      expect(screen.getByText('10')).toBeInTheDocument() // total_completions
      expect(screen.getByText('5,000')).toBeInTheDocument() // total_xp formatted
    })
  })
})
