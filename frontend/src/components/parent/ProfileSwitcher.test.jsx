import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileSwitcher from './ProfileSwitcher'

// Mock the dependentAPI
vi.mock('../../services/dependentAPI', () => ({
  getMyDependents: vi.fn()
}))

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

import { getMyDependents } from '../../services/dependentAPI'

describe('ProfileSwitcher', () => {
  const mockParent = {
    id: 'parent-123',
    display_name: 'Test Parent',
    email: 'parent@test.com',
    role: 'parent',
    is_dependent: false
  }

  const mockDependents = [
    {
      id: 'dep-1',
      display_name: 'Child One',
      date_of_birth: '2015-06-15',
      age: 9,
      total_xp: 500,
      active_quest_count: 2,
      promotion_eligible: false,
      avatar_url: null
    },
    {
      id: 'dep-2',
      display_name: 'Child Two',
      date_of_birth: '2017-03-20',
      age: 7,
      total_xp: 250,
      active_quest_count: 1,
      promotion_eligible: false,
      avatar_url: null
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    getMyDependents.mockResolvedValue({ dependents: mockDependents })
  })

  describe('Rendering', () => {
    it('renders loading skeleton while fetching dependents', () => {
      getMyDependents.mockImplementation(() => new Promise(() => {})) // Never resolves
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      // Loading state shows skeleton
      const skeletons = screen.getAllByRole('generic').filter(el => el.className.includes('animate-pulse'))
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('renders current profile name in dropdown trigger', async () => {
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })
    })

    it('renders dependents list when dropdown is open', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      // Open dropdown
      await user.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText('Child One')).toBeInTheDocument()
        expect(screen.getByText('Child Two')).toBeInTheDocument()
      })
    })

    it('shows age for each dependent', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/Age 9/i)).toBeInTheDocument()
        expect(screen.getByText(/Age 7/i)).toBeInTheDocument()
      })
    })

    it('shows XP for each dependent', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/500 XP/i)).toBeInTheDocument()
        expect(screen.getByText(/250 XP/i)).toBeInTheDocument()
      })
    })
  })

  describe('Interactions', () => {
    it('opens dropdown when clicking trigger button', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      const button = screen.getByRole('button')
      await user.click(button)

      expect(screen.getByText('Child One')).toBeInTheDocument()
    })

    it('closes dropdown when clicking outside', async () => {
      const user = userEvent.setup()
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />
        </div>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      // Open dropdown
      await user.click(screen.getAllByRole('button')[0])
      expect(screen.getByText('Child One')).toBeInTheDocument()

      // Click outside
      await user.click(screen.getByTestId('outside'))

      await waitFor(() => {
        expect(screen.queryByText('Child One')).not.toBeInTheDocument()
      })
    })

    it('calls onProfileChange when selecting a dependent', async () => {
      const onProfileChange = vi.fn()
      const user = userEvent.setup()
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={onProfileChange} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      // Click on the dependent button - Child One
      const childButtons = screen.getAllByRole('button')
      const childOneButton = childButtons.find(btn => btn.textContent.includes('Child One'))
      await user.click(childOneButton)

      expect(onProfileChange).toHaveBeenCalled()
      const calledWith = onProfileChange.mock.calls[0][0]
      expect(calledWith.id).toBe('dep-1')
      expect(calledWith.display_name).toBe('Child One')
    })

    it('calls onAddDependent when clicking Add Child Profile button', async () => {
      const onAddDependent = vi.fn()
      const user = userEvent.setup()
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={onAddDependent} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      const addButton = screen.getByText(/add child profile/i)
      await user.click(addButton)

      expect(onAddDependent).toHaveBeenCalled()
    })
  })

  describe('Empty State', () => {
    it('shows add child button when no dependents exist', async () => {
      getMyDependents.mockResolvedValue({ dependents: [] })
      const user = userEvent.setup()

      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/add child profile/i)).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('handles API error gracefully', async () => {
      getMyDependents.mockRejectedValue(new Error('API Error'))

      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        // Should still render without crashing
        expect(screen.getByRole('button')).toBeInTheDocument()
      })
    })
  })

  describe('Current Profile Indicator', () => {
    it('shows current profile indicator for parent when parent is current profile', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher currentProfile={mockParent} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      // Parent section should have "Current" badge
      const currentBadges = screen.getAllByText('Current')
      expect(currentBadges.length).toBeGreaterThan(0)
    })

    it('shows current profile indicator for selected dependent', async () => {
      const user = userEvent.setup()
      const mockDepProfile = {
        ...mockDependents[0],
        is_dependent: true
      }
      render(<ProfileSwitcher currentProfile={mockDepProfile} onProfileChange={vi.fn()} onAddDependent={vi.fn()} />)

      await waitFor(() => {
        expect(screen.getByText('Child One')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      await waitFor(() => {
        // Child One should have Current badge
        const currentBadges = screen.getAllByText('Current')
        expect(currentBadges.length).toBeGreaterThan(0)
      })
    })
  })
})
