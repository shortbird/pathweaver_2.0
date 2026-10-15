import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrganizationDashboard from './OrganizationDashboard'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
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
    quest_visibility_policy: 'curated',
    feature_flags: { sis_enabled: true, hide_public_bounties: true }
  }
]

describe('OrganizationDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { organizations: mockOrganizations } })
    api.post.mockResolvedValue({ data: {} })
    api.put.mockResolvedValue({ data: {} })
    api.patch.mockResolvedValue({ data: { modules: {} } })
    api.delete.mockResolvedValue({ data: {} })
  })

  describe('loading state', () => {
    it('shows a loading spinner while fetching', () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      render(<OrganizationDashboard />)
      expect(screen.getByRole('status', { name: 'Loading organizations' })).toBeInTheDocument()
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

  describe('no SIS switch', () => {
    // Every org is an SIS org since 2026-10-15; the backend refuses a 'sis'
    // module change, so the dashboard offers no switch for it.
    it('offers no Enable SIS toggle and never writes the sis module', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Springfield Academy')).toBeInTheDocument()
      })
      expect(screen.queryByText('Enable SIS')).not.toBeInTheDocument()
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      expect(api.patch).not.toHaveBeenCalled()
    })

    it('Manage opens the SIS console on that school', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Manage').length).toBe(2)
      })
      // jsdom is not an Optio host, so the link is the same-origin form.
      expect(screen.getAllByText('Manage')[0].closest('a'))
        .toHaveAttribute('href', '/?organization_id=org-1&app=sis')
    })
  })

  describe('archiving', () => {
    it('offers Archive on a live org, and not Restore or Delete', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Archive').length).toBe(2)
      })
      expect(screen.queryByText('Restore')).not.toBeInTheDocument()
      expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    })

    it('spells out what archiving does to members before confirming', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Springfield Academy')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Archive Springfield Academy' }))

      expect(screen.getByText('Archive Springfield Academy?')).toBeInTheDocument()
      expect(screen.getByText(/becomes a standalone platform account/i)).toBeInTheDocument()
      expect(screen.getByText(/keep all of their work/i)).toBeInTheDocument()
    })

    it('archives via POST and refetches', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Springfield Academy')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Archive Springfield Academy' }))
      fireEvent.click(screen.getByText('Archive organization'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/admin/organizations/org-1/archive', {})
      })
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(2)
      })
    })

    it('surfaces the backend error instead of closing the modal', async () => {
      api.post.mockRejectedValue({ response: { data: { error: 'Organization is already archived' } } })

      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Springfield Academy')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Archive Springfield Academy' }))
      fireEvent.click(screen.getByText('Archive organization'))

      await waitFor(() => {
        expect(screen.getByText('Organization is already archived')).toBeInTheDocument()
      })
    })

    it('asks the backend for archived orgs only when the box is checked', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/admin/organizations')
      })

      fireEvent.click(screen.getByLabelText('Show archived'))

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/admin/organizations?include_archived=true')
      })
    })
  })

  describe('archived organizations', () => {
    const archivedOrg = {
      id: 'org-3',
      name: 'Closed Academy',
      slug: 'closed',
      quest_visibility_policy: 'all_optio',
      is_active: false,
      archived_at: '2026-08-15T00:00:00Z'
    }

    beforeEach(() => {
      api.get.mockResolvedValue({ data: { organizations: [archivedOrg] } })
    })

    it('marks it archived and swaps Manage/Archive for Restore/Delete', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Archived')).toBeInTheDocument()
      })
      expect(screen.getByText('Restore')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.queryByText('Manage')).not.toBeInTheDocument()
      // A retired org has no operations, so no Blocks either.
      expect(screen.queryByText('Blocks')).not.toBeInTheDocument()
    })

    it('restores via POST and refetches', async () => {
      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Restore'))

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/admin/organizations/org-3/restore', {})
      })
    })

    it('names what still references the org and refuses to delete', async () => {
      api.get.mockImplementation((url) =>
        url.includes('deletion-preview')
          ? Promise.resolve({
              data: {
                can_delete: false,
                reasons: ['Records still reference this organization.'],
                blockers: [{ table: 'org_classes', rows: 12 }, { table: 'announcements', rows: 3 }]
              }
            })
          : Promise.resolve({ data: { organizations: [archivedOrg] } })
      )

      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(screen.getByText('org_classes')).toBeInTheDocument()
      })
      expect(screen.getByText('announcements')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('Delete permanently')).toBeDisabled()
      // No name field either -- there is nothing to confirm yet.
      expect(screen.queryByLabelText(/to confirm/)).not.toBeInTheDocument()
    })

    it('requires the exact org name before deleting an empty one', async () => {
      api.get.mockImplementation((url) =>
        url.includes('deletion-preview')
          ? Promise.resolve({ data: { can_delete: true, reasons: [], blockers: [] } })
          : Promise.resolve({ data: { organizations: [archivedOrg] } })
      )

      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      const input = await screen.findByLabelText(/to confirm/)
      expect(screen.getByText('Delete permanently')).toBeDisabled()

      fireEvent.change(input, { target: { value: 'closed academy' } })
      expect(screen.getByText('Delete permanently')).toBeDisabled()

      fireEvent.change(input, { target: { value: 'Closed Academy' } })
      expect(screen.getByText('Delete permanently')).toBeEnabled()

      fireEvent.click(screen.getByText('Delete permanently'))

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/api/admin/organizations/org-3', {
          data: { confirm_name: 'Closed Academy' }
        })
      })
    })

    it('shows the blockers the backend returns if the org filled up mid-flow', async () => {
      api.get.mockImplementation((url) =>
        url.includes('deletion-preview')
          ? Promise.resolve({ data: { can_delete: true, reasons: [], blockers: [] } })
          : Promise.resolve({ data: { organizations: [archivedOrg] } })
      )
      api.delete.mockRejectedValue({
        response: { data: { error: 'Still in use', blockers: [{ table: 'quests', rows: 1 }] } }
      })

      render(<OrganizationDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Delete'))

      const input = await screen.findByLabelText(/to confirm/)
      fireEvent.change(input, { target: { value: 'Closed Academy' } })
      fireEvent.click(screen.getByText('Delete permanently'))

      await waitFor(() => {
        expect(screen.getByText('quests')).toBeInTheDocument()
      })
      expect(screen.getByText('Still in use')).toBeInTheDocument()
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
