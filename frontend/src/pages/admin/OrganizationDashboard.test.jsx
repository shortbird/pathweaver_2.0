import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrganizationDashboard from './OrganizationDashboard'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

import api from '../../services/api'

const mockOrganizations = [
  {
    id: 'org-1',
    name: 'Springfield Academy',
    slug: 'springfield',
    quest_visibility_policy: 'all_optio'
  },
  {
    id: 'org-2',
    name: 'Riverside School',
    slug: 'riverside',
    quest_visibility_policy: 'curated'
  }
]

describe('OrganizationDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { organizations: mockOrganizations } })
    api.post.mockResolvedValue({ data: {} })
  })

  describe('loading state', () => {
    it('shows loading text while fetching', () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      render(<OrganizationDashboard />)
      expect(screen.getByText('Loading organizations...')).toBeInTheDocument()
    })
  })

  describe('rendering', () => {
    it('renders Organizations heading', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Organizations')).toBeInTheDocument()
      })
    })

    it('renders Create Organization button', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Create Organization')).toBeInTheDocument()
      })
    })

    it('renders organization names', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Springfield Academy')).toBeInTheDocument()
        expect(screen.getByText('Riverside School')).toBeInTheDocument()
      })
    })

    it('renders organization slugs', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Slug: springfield')).toBeInTheDocument()
        expect(screen.getByText('Slug: riverside')).toBeInTheDocument()
      })
    })

    it('renders policy labels', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Policy: All Optio Quests')).toBeInTheDocument()
        expect(screen.getByText('Policy: Curated Quests')).toBeInTheDocument()
      })
    })

    it('renders Manage links for each org', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        const manageLinks = screen.getAllByText('Manage')
        expect(manageLinks.length).toBe(2)
      })
    })
  })

  describe('create modal', () => {
    it('shows create modal when button clicked', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Create Organization')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Create Organization'))

      // Modal has same title "Create Organization" plus form fields
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Slug')).toBeInTheDocument()
      expect(screen.getByText('Quest Visibility Policy')).toBeInTheDocument()
    })

    it('shows Cancel button in modal', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Create Organization')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Create Organization'))

      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('shows Create submit button in modal', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Create Organization')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Create Organization'))

      expect(screen.getByText('Create')).toBeInTheDocument()
    })
  })
})
