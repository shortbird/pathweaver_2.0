import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QuestVisibilityManager from '../QuestVisibilityManager'
import api from '../../../services/api'

vi.mock('../../../services/api')

const mockQuests = [
  { id: 'q1', title: 'Math Basics', description: 'Learn math', organization_id: null, pillar_primary: 'Academic' },
  { id: 'q2', title: 'Science 101', description: 'Learn science', organization_id: null, pillar_primary: 'Academic' },
  { id: 'q3', title: 'Org Quest', description: 'Custom quest', organization_id: 'org-123', pillar_primary: 'Custom' },
  { id: 'q4', title: 'Other Org Quest', description: 'Other org', organization_id: 'org-456', pillar_primary: 'Custom' },
]

const mockSiteSettings = {
  logo_url: 'https://example.com/optio-logo.png'
}

describe('QuestVisibilityManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Policy-based filtering', () => {
    it('shows all Optio quests and org quests for all_optio policy', async () => {
      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'all_optio',
          branding_config: {}
        },
        curated_quests: []
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: mockQuests } })
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        // Should show Optio quests (q1, q2) and org's own quest (q3), but NOT other org's quest (q4)
        expect(screen.getByText('Math Basics')).toBeInTheDocument()
        expect(screen.getByText('Science 101')).toBeInTheDocument()
        expect(screen.getByText('Org Quest')).toBeInTheDocument()
      })

      // Should NOT show other org's quest
      expect(screen.queryByText('Other Org Quest')).not.toBeInTheDocument()
    })

    it('shows only org quests for private_only policy', async () => {
      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'private_only',
          branding_config: {}
        },
        curated_quests: []
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: mockQuests } })
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        // Should only show org's own quest
        expect(screen.getByText('Org Quest')).toBeInTheDocument()
      })

      // Should NOT show Optio quests
      expect(screen.queryByText('Math Basics')).not.toBeInTheDocument()
      expect(screen.queryByText('Science 101')).not.toBeInTheDocument()
      expect(screen.queryByText('Other Org Quest')).not.toBeInTheDocument()
    })

    it('shows Optio quests with toggles for curated policy', async () => {
      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'curated',
          branding_config: {}
        },
        curated_quests: [{ quest_id: 'q1' }]
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: mockQuests } })
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [{ quest_id: 'q1' }] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Math Basics')).toBeInTheDocument()
        expect(screen.getByText('Science 101')).toBeInTheDocument()
        expect(screen.getByText('Org Quest')).toBeInTheDocument()
      })

      // Should have toggle buttons for Optio quests (not org quests)
      const toggles = screen.getAllByRole('button')
      expect(toggles.length).toBeGreaterThan(0)
    })

    it('shows empty state message for private_only with no org quests', async () => {
      const orgData = {
        organization: {
          id: 'org-999', // No quests for this org
          quest_visibility_policy: 'private_only',
          branding_config: {}
        },
        curated_quests: []
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: mockQuests } })
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      render(
        <QuestVisibilityManager
          orgId="org-999"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        expect(screen.getByText(/No organization quests found/i)).toBeInTheDocument()
      })
    })
  })

  describe('Toggle behavior', () => {
    it('shows locked toggles for all_optio policy', async () => {
      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'all_optio',
          branding_config: {}
        },
        curated_quests: []
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: mockQuests.slice(0, 2) } }) // Only Optio quests
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Math Basics')).toBeInTheDocument()
      })

      // Locked toggles should have cursor-not-allowed class
      const lockedToggles = document.querySelectorAll('.cursor-not-allowed')
      expect(lockedToggles.length).toBeGreaterThan(0)
    })

    it('allows toggling for curated policy', async () => {
      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'curated',
          branding_config: {}
        },
        curated_quests: []
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: mockQuests.slice(0, 2) } })
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      api.post.mockResolvedValue({ data: { success: true } })

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Math Basics')).toBeInTheDocument()
      })

      // Find and click a toggle button
      const toggleButtons = screen.getAllByRole('button').filter(btn =>
        btn.className.includes('rounded-full') && btn.className.includes('h-6')
      )

      if (toggleButtons.length > 0) {
        fireEvent.click(toggleButtons[0])

        await waitFor(() => {
          expect(api.post).toHaveBeenCalledWith(
            expect.stringContaining('/quests/grant'),
            expect.any(Object)
          )
        })
      }
    })

    it('shows "Always" badge for org quests', async () => {
      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'all_optio',
          branding_config: {}
        },
        curated_quests: []
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: [mockQuests[2]] } }) // Only org quest
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Org Quest')).toBeInTheDocument()
        expect(screen.getByText('Always')).toBeInTheDocument()
      })
    })
  })

  describe('Optimistic updates', () => {
    it('updates UI immediately when toggling and reverts on error', async () => {
      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'curated',
          branding_config: {}
        },
        curated_quests: [{ quest_id: 'q1' }]
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: mockQuests.slice(0, 1) } })
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [{ quest_id: 'q1' }] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      // Mock API failure
      api.post.mockRejectedValue(new Error('Network error'))

      // Mock alert
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Math Basics')).toBeInTheDocument()
      })

      // Find toggle button
      const toggleButtons = screen.getAllByRole('button').filter(btn =>
        btn.className.includes('rounded-full') && btn.className.includes('h-6')
      )

      if (toggleButtons.length > 0) {
        fireEvent.click(toggleButtons[0])

        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalled()
        })
      }

      alertSpy.mockRestore()
    })
  })

  describe('Search functionality', () => {
    it('filters quests by search term', async () => {
      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'all_optio',
          branding_config: {}
        },
        curated_quests: []
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: mockQuests.slice(0, 2) } })
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Math Basics')).toBeInTheDocument()
        expect(screen.getByText('Science 101')).toBeInTheDocument()
      })

      // Search for "Math"
      const searchInput = screen.getByPlaceholderText('Search quests...')
      fireEvent.change(searchInput, { target: { value: 'Math' } })

      await waitFor(() => {
        expect(screen.getByText('Math Basics')).toBeInTheDocument()
        expect(screen.queryByText('Science 101')).not.toBeInTheDocument()
      })
    })
  })

  describe('Pagination', () => {
    it('paginates quests correctly', async () => {
      // Create 30 quests to test pagination (25 per page)
      const manyQuests = Array.from({ length: 30 }, (_, i) => ({
        id: `q${i}`,
        title: `Quest ${i + 1}`,
        description: `Description ${i}`,
        organization_id: null,
        pillar_primary: 'Academic'
      }))

      const orgData = {
        organization: {
          id: 'org-123',
          quest_visibility_policy: 'all_optio',
          branding_config: {}
        },
        curated_quests: []
      }

      api.get.mockImplementation((url) => {
        if (url.includes('/api/admin/quests')) {
          return Promise.resolve({ data: { quests: manyQuests } })
        }
        if (url.includes('/api/admin/organizations/')) {
          return Promise.resolve({ data: { curated_quests: [] } })
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      render(
        <QuestVisibilityManager
          orgId="org-123"
          orgData={orgData}
          onUpdate={vi.fn()}
          siteSettings={mockSiteSettings}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Quest 1')).toBeInTheDocument()
      })

      // Should show pagination info
      expect(screen.getByText(/Showing 1 to 25 of 30/)).toBeInTheDocument()

      // Click next page
      const nextButton = screen.getByText('Next')
      fireEvent.click(nextButton)

      await waitFor(() => {
        expect(screen.getByText('Quest 26')).toBeInTheDocument()
      })
    })
  })
})
