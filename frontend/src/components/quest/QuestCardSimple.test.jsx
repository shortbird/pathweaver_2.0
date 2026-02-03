import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, createMockQuest, createMockUser } from '../../tests/test-utils'
import QuestCardSimple from './QuestCardSimple'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock useAuth hook
const mockUser = createMockUser()
const mockAuthValue = {
  user: mockUser,
  isAuthenticated: true,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}))

describe('QuestCardSimple', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('renders quest title', () => {
      const quest = createMockQuest({ title: 'Learn React Basics' })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.getByText('Learn React Basics')).toBeInTheDocument()
    })

    it('renders quest description when not started', () => {
      const quest = createMockQuest({
        description: 'Learn the fundamentals of React',
        user_enrollment: null
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.getByText('Learn the fundamentals of React')).toBeInTheDocument()
    })

    it('renders big_idea if no description provided', () => {
      const quest = createMockQuest({
        description: null,
        big_idea: 'Build interactive UIs',
        user_enrollment: null
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.getByText('Build interactive UIs')).toBeInTheDocument()
    })

    it('renders fallback text if no description or big_idea', () => {
      const quest = createMockQuest({
        description: null,
        big_idea: null,
        user_enrollment: null
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.getByText('Explore this quest to learn more.')).toBeInTheDocument()
    })
  })

  describe('Quest States', () => {
    describe('Not Started State', () => {
      it('shows description only when quest not started', () => {
        const quest = createMockQuest({
          description: 'Quest description',
          user_enrollment: null
        })

        renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        expect(screen.getByText('Quest description')).toBeInTheDocument()
        // Check that Continue button doesn't exist (exact match, not in "Current Task:")
        expect(screen.queryByText((content, element) => {
          return element.tagName === 'SPAN' && content === 'Continue'
        })).not.toBeInTheDocument()
        expect(screen.queryByText(/view on diploma/i)).not.toBeInTheDocument()
      })
    })

    describe('In Progress State', () => {
      it('shows progress bar for in-progress quest', () => {
        const quest = createMockQuest({
          user_enrollment: { id: '1', status: 'active' },
          progress: {
            completed_tasks: 3,
            total_tasks: 10,
            percentage: 30
          }
        })

        renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        expect(screen.getByText('3/10 TASKS COMPLETED')).toBeInTheDocument()
        expect(screen.getByText('30%')).toBeInTheDocument()
        // Check for Continue button (exact text match in span element)
        expect(screen.getByText((content, element) => {
          return element.tagName === 'SPAN' && content === 'Continue'
        })).toBeInTheDocument()
      })

      it('shows current task title', () => {
        const quest = createMockQuest({
          user_enrollment: { id: '1', status: 'active' },
          quest_tasks: [
            { id: '1', title: 'Completed Task', is_completed: true },
            { id: '2', title: 'Next Task to Complete', is_completed: false },
            { id: '3', title: 'Future Task', is_completed: false }
          ],
          progress: { percentage: 30 }
        })

        renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        expect(screen.getByText(/current task: next task to complete/i)).toBeInTheDocument()
      })

      it('shows fallback task title when no current task found', () => {
        const quest = createMockQuest({
          user_enrollment: { id: '1', status: 'active' },
          quest_tasks: [],
          progress: { percentage: 50 }
        })

        renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        expect(screen.getByText(/current task: continue your quest/i)).toBeInTheDocument()
      })

      it('calculates progress percentage correctly', () => {
        const quest = createMockQuest({
          user_enrollment: { id: '1', status: 'active' },
          progress: {
            completed_tasks: 5,
            total_tasks: 8,
            percentage: 62.5
          }
        })

        const { container } = renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        // Check percentage is rounded
        expect(screen.getByText('63%')).toBeInTheDocument()

        // Check progress bar width (query within the gray progress container to avoid matching the background gradient)
        const progressContainer = container.querySelector('.bg-gray-200.rounded-full.h-2')
        const progressBar = progressContainer.querySelector('.bg-gradient-primary')
        expect(progressBar).toHaveStyle({ width: '62.5%' })
      })

      it('handles zero progress', () => {
        const quest = createMockQuest({
          user_enrollment: { id: '1', status: 'active' },
          progress: {
            completed_tasks: 0,
            total_tasks: 10,
            percentage: 0
          }
        })

        renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        expect(screen.getByText('0/10 TASKS COMPLETED')).toBeInTheDocument()
        expect(screen.getByText('0%')).toBeInTheDocument()
      })
    })

    describe('Completed State', () => {
      it('shows diploma button when quest is completed via completed_enrollment', () => {
        const quest = createMockQuest({
          completed_enrollment: true
        })

        renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        expect(screen.getByText(/view on diploma/i)).toBeInTheDocument()
        // Check that Continue button doesn't exist (exact match)
        expect(screen.queryByText((content, element) => {
          return element.tagName === 'SPAN' && content === 'Continue'
        })).not.toBeInTheDocument()
      })

      it('shows diploma button when quest is 100% complete', () => {
        const quest = createMockQuest({
          user_enrollment: { id: '1', status: 'active' },
          progress: {
            completed_tasks: 10,
            total_tasks: 10,
            percentage: 100
          }
        })

        renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        expect(screen.getByText(/view on diploma/i)).toBeInTheDocument()
      })

      it('shows quest description in completed state', () => {
        const quest = createMockQuest({
          description: 'You mastered React!',
          completed_enrollment: true
        })

        renderWithProviders(<QuestCardSimple quest={quest} />, {
          authValue: { user: mockUser, isAuthenticated: true }
        })

        expect(screen.getByText('You mastered React!')).toBeInTheDocument()
      })
    })
  })

  describe('Private Quest Badge', () => {
    it('shows private badge when quest is private', () => {
      const quest = createMockQuest({
        is_public: false
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.getByText('Private Quest')).toBeInTheDocument()
    })

    it('does not show private badge when quest is public', () => {
      const quest = createMockQuest({
        is_public: true
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.queryByText('Private Quest')).not.toBeInTheDocument()
    })

    it('does not show private badge when is_public is undefined', () => {
      const quest = createMockQuest({
        is_public: undefined
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.queryByText('Private Quest')).not.toBeInTheDocument()
    })
  })

  describe('OnFire/Spark Platform Quests', () => {
    it('shows OnFire logo for spark platform quests', () => {
      const quest = createMockQuest({
        title: 'OnFire Course',
        lms_platform: 'spark'
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const logo = screen.getByAltText('OnFire quest designation badge')
      expect(logo).toBeInTheDocument()
      expect(logo).toHaveAttribute('src', expect.stringContaining('onfire.png'))
    })

    it('shows white background for spark quests instead of image', () => {
      const quest = createMockQuest({
        title: 'Spark Quest',
        lms_platform: 'spark',
        image_url: 'https://example.com/should-not-show.jpg'
      })

      const { container } = renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      // OnFire logo should be visible
      expect(screen.getByAltText('OnFire quest designation badge')).toBeInTheDocument()

      // Regular quest image should NOT be rendered
      const questImage = container.querySelector('img[alt="Spark Quest"]')
      expect(questImage).not.toBeInTheDocument()
    })

    it('shows regular quest layout for non-spark quests', () => {
      const quest = createMockQuest({
        title: 'Regular Quest',
        lms_platform: 'optio',
        image_url: 'https://example.com/quest-image.jpg'
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const questImage = screen.getByAltText('Quest: Regular Quest')
      expect(questImage).toBeInTheDocument()
      expect(questImage).toHaveAttribute('src', 'https://example.com/quest-image.jpg')
    })
  })

  describe('Quest Images', () => {
    it('renders quest image when image_url is provided', () => {
      const quest = createMockQuest({
        title: 'Quest with Image',
        image_url: 'https://example.com/image.jpg'
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const image = screen.getByAltText('Quest: Quest with Image')
      expect(image).toHaveAttribute('src', 'https://example.com/image.jpg')
    })

    it('renders quest image when header_image_url is provided', () => {
      const quest = createMockQuest({
        title: 'Quest with Header',
        image_url: null,
        header_image_url: 'https://example.com/header.jpg'
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const image = screen.getByAltText('Quest: Quest with Header')
      expect(image).toHaveAttribute('src', 'https://example.com/header.jpg')
    })

    it('prefers image_url over header_image_url when both provided', () => {
      const quest = createMockQuest({
        title: 'Quest with Both',
        image_url: 'https://example.com/primary.jpg',
        header_image_url: 'https://example.com/fallback.jpg'
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const image = screen.getByAltText('Quest: Quest with Both')
      expect(image).toHaveAttribute('src', 'https://example.com/primary.jpg')
    })

    it('shows gradient fallback when no image provided', () => {
      const quest = createMockQuest({
        image_url: null,
        header_image_url: null
      })

      const { container } = renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const gradient = container.querySelector('.bg-gradient-primary')
      expect(gradient).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('navigates to quest detail page when card is clicked', async () => {
      const user = userEvent.setup()
      const quest = createMockQuest({ id: 'quest-123' })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const card = screen.getByText(quest.title).closest('div').parentElement
      await user.click(card)

      expect(mockNavigate).toHaveBeenCalledWith('/quests/quest-123')
    })

    it('navigates to diploma page when diploma button clicked', async () => {
      const user = userEvent.setup()
      const quest = createMockQuest({
        completed_enrollment: true
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const diplomaButton = screen.getByText(/view on diploma/i)
      await user.click(diplomaButton)

      expect(mockNavigate).toHaveBeenCalledWith('/diploma')
    })

    it('prevents card navigation when diploma button clicked (stopPropagation)', async () => {
      const user = userEvent.setup()
      const quest = createMockQuest({
        id: 'quest-123',
        completed_enrollment: true
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const diplomaButton = screen.getByText(/view on diploma/i)
      await user.click(diplomaButton)

      // Should navigate to diploma, not quest detail
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/diploma')
      expect(mockNavigate).not.toHaveBeenCalledWith('/quests/quest-123')
    })

    it('navigates to quest detail when continue button clicked', async () => {
      const user = userEvent.setup()
      const quest = createMockQuest({
        id: 'quest-456',
        user_enrollment: { id: '1', status: 'active' },
        progress: { percentage: 50 }
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      // Find Continue button by exact text match in span element
      const continueButton = screen.getByText((content, element) => {
        return element.tagName === 'SPAN' && content === 'Continue'
      })
      await user.click(continueButton)

      // Continue button doesn't stopPropagation, so it triggers card click
      expect(mockNavigate).toHaveBeenCalledWith('/quests/quest-456')
    })
  })

  describe('Accessibility', () => {
    it('has cursor-pointer class for clickable card', () => {
      const quest = createMockQuest()

      const { container } = renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const card = container.firstChild
      expect(card).toHaveClass('cursor-pointer')
    })

    it('diploma button is accessible button element', () => {
      const quest = createMockQuest({
        completed_enrollment: true
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const button = screen.getByRole('button', { name: /view on diploma/i })
      expect(button).toBeInTheDocument()
    })

    it('has alt text for quest images', () => {
      const quest = createMockQuest({
        title: 'Accessible Quest',
        image_url: 'https://example.com/image.jpg'
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const image = screen.getByAltText('Quest: Accessible Quest')
      expect(image).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles missing progress data gracefully', () => {
      const quest = createMockQuest({
        user_enrollment: { id: '1', status: 'active' },
        progress: null
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      expect(screen.getByText('0/0 TASKS COMPLETED')).toBeInTheDocument()
      expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('handles missing quest_tasks array', () => {
      const quest = createMockQuest({
        user_enrollment: { id: '1', status: 'active' },
        quest_tasks: undefined,
        progress: { percentage: 25 }
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      // Should show fallback task title
      expect(screen.getByText(/current task: continue your quest/i)).toBeInTheDocument()
    })

    it('handles OnFire logo load error gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const quest = createMockQuest({
        title: 'Spark Quest',
        lms_platform: 'spark'
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      const logo = screen.getByAltText('OnFire quest designation badge')

      // Simulate image error
      const errorEvent = new Event('error')
      logo.dispatchEvent(errorEvent)

      expect(consoleError).toHaveBeenCalledWith('Failed to load OnFire logo')

      consoleError.mockRestore()
    })

    it('handles very long quest titles', () => {
      const quest = createMockQuest({
        title: 'This is a very long quest title that should be truncated because it exceeds the maximum number of characters allowed in the card display'
      })

      const { container } = renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      // Title should have line-clamp class
      const title = container.querySelector('h3')
      expect(title).toHaveClass('line-clamp-2')
    })

    it('handles 99.9% progress (rounds to 100% display)', () => {
      const quest = createMockQuest({
        user_enrollment: { id: '1', status: 'active' },
        progress: {
          completed_tasks: 999,
          total_tasks: 1000,
          percentage: 99.9
        }
      })

      renderWithProviders(<QuestCardSimple quest={quest} />, {
        authValue: { user: mockUser, isAuthenticated: true }
      })

      // Should round to 100% in display
      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.getByText('999/1000 TASKS COMPLETED')).toBeInTheDocument()
    })
  })

  describe('Component Memoization', () => {
    it('is wrapped in React.memo for performance', () => {
      // Check that the component is memoized
      expect(QuestCardSimple.$$typeof).toBeDefined()
    })
  })
})
