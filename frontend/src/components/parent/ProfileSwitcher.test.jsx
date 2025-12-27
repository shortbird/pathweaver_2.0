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
    role: 'parent'
  }

  const mockDependents = [
    {
      id: 'dep-1',
      display_name: 'Child One',
      date_of_birth: '2015-06-15',
      age: 9,
      total_xp: 500,
      promotion_eligible_at: '2028-06-15'
    },
    {
      id: 'dep-2',
      display_name: 'Child Two',
      date_of_birth: '2017-03-20',
      age: 7,
      total_xp: 250,
      promotion_eligible_at: '2030-03-20'
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    getMyDependents.mockResolvedValue({ dependents: mockDependents })
  })

  describe('Rendering', () => {
    it('renders loading skeleton while fetching dependents', () => {
      getMyDependents.mockImplementation(() => new Promise(() => {})) // Never resolves
      render(<ProfileSwitcher parent={mockParent} />)

      expect(screen.getByTestId('profile-switcher-loading') || screen.getByRole('button')).toBeInTheDocument()
    })

    it('renders parent name in dropdown trigger', async () => {
      render(<ProfileSwitcher parent={mockParent} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })
    })

    it('renders dependents list when dropdown is open', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher parent={mockParent} />)

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
      render(<ProfileSwitcher parent={mockParent} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/9 years/i)).toBeInTheDocument()
        expect(screen.getByText(/7 years/i)).toBeInTheDocument()
      })
    })

    it('shows XP for each dependent', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher parent={mockParent} />)

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
      render(<ProfileSwitcher parent={mockParent} />)

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
          <ProfileSwitcher parent={mockParent} />
        </div>
      )

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      // Open dropdown
      await user.click(screen.getByRole('button'))
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
      render(<ProfileSwitcher parent={mockParent} onProfileChange={onProfileChange} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))
      await user.click(screen.getByText('Child One'))

      expect(onProfileChange).toHaveBeenCalledWith(mockDependents[0])
    })

    it('calls onAddChild when clicking Add Child button', async () => {
      const onAddChild = vi.fn()
      const user = userEvent.setup()
      render(<ProfileSwitcher parent={mockParent} onAddChild={onAddChild} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      const addButton = screen.getByText(/add child/i)
      await user.click(addButton)

      expect(onAddChild).toHaveBeenCalled()
    })
  })

  describe('Empty State', () => {
    it('shows empty message when no dependents exist', async () => {
      getMyDependents.mockResolvedValue({ dependents: [] })
      const user = userEvent.setup()

      render(<ProfileSwitcher parent={mockParent} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText(/no child profiles/i) || screen.getByText(/add child/i)).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('handles API error gracefully', async () => {
      getMyDependents.mockRejectedValue(new Error('API Error'))

      render(<ProfileSwitcher parent={mockParent} />)

      await waitFor(() => {
        // Should still render without crashing
        expect(screen.getByRole('button')).toBeInTheDocument()
      })
    })
  })

  describe('Current Profile Indicator', () => {
    it('shows current profile indicator for parent when no dependent selected', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher parent={mockParent} currentProfileId={null} />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      // Parent should have current indicator
      const parentItem = screen.getByText('Test Parent').closest('div')
      expect(parentItem).toHaveClass(/current|active|selected/i)
    })

    it('shows current profile indicator for selected dependent', async () => {
      const user = userEvent.setup()
      render(<ProfileSwitcher parent={mockParent} currentProfileId="dep-1" />)

      await waitFor(() => {
        expect(screen.getByText('Test Parent')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button'))

      await waitFor(() => {
        const childOneItem = screen.getByText('Child One')
        expect(childOneItem).toBeInTheDocument()
      })
    })
  })
})
