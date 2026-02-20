import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import QuestCardSimple from './QuestCardSimple'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

vi.mock('../../hooks/api/useQuests', () => ({
  useQuestEngagement: () => ({
    data: {
      rhythm: { state: 'building', state_display: 'Building Momentum' },
      calendar: { days: [] }
    }
  })
}))

// Mock heroicons
vi.mock('@heroicons/react/24/solid', () => ({
  BoltIcon: (props) => <svg data-testid="bolt-icon" {...props} />,
  ArrowTrendingUpIcon: (props) => <svg data-testid="trending-icon" {...props} />,
  MoonIcon: (props) => <svg data-testid="moon-icon" {...props} />,
  ArrowPathIcon: (props) => <svg data-testid="path-icon" {...props} />,
  PlayCircleIcon: (props) => <svg data-testid="play-icon" {...props} />
}))

function renderCard(questOverrides = {}) {
  const defaultQuest = {
    id: 'quest-1',
    title: 'Test Quest',
    description: 'A test quest description',
    image_url: null,
    header_image_url: null,
    is_public: true,
    user_enrollment: null,
    completed_enrollment: false,
    quest_tasks: [],
    progress: null,
    lms_platform: null,
    big_idea: 'Testing is important',
    ...questOverrides
  }

  return render(
    <MemoryRouter>
      <QuestCardSimple quest={defaultQuest} />
    </MemoryRouter>
  )
}

describe('QuestCardSimple', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Rendering ---
  describe('rendering', () => {
    it('renders quest title', () => {
      renderCard({ title: 'Learn JavaScript' })
      expect(screen.getByText('Learn JavaScript')).toBeInTheDocument()
    })

    it('renders description for not-started quest', () => {
      renderCard({ description: 'Build web apps' })
      expect(screen.getByText('Build web apps')).toBeInTheDocument()
    })

    it('renders big_idea as fallback when no description', () => {
      renderCard({ description: null, big_idea: 'Coding is fun' })
      expect(screen.getByText('Coding is fun')).toBeInTheDocument()
    })

    it('shows private badge for private quests', () => {
      renderCard({ is_public: false })
      expect(screen.getByText('Private')).toBeInTheDocument()
    })

    it('does not show private badge for public quests', () => {
      renderCard({ is_public: true })
      expect(screen.queryByText('Private')).not.toBeInTheDocument()
    })
  })

  // --- Quest states ---
  describe('not started state', () => {
    it('shows Start Quest button', () => {
      renderCard({ user_enrollment: null })
      expect(screen.getByText('Start Quest')).toBeInTheDocument()
    })
  })

  describe('in progress state', () => {
    it('shows Continue button', () => {
      renderCard({
        user_enrollment: { id: 'e-1' },
        completed_enrollment: false,
        quest_tasks: [
          { id: 't-1', title: 'Task 1', is_completed: false }
        ],
        progress: { percentage: 50 }
      })
      expect(screen.getByText('Continue')).toBeInTheDocument()
    })

    it('shows next task title', () => {
      renderCard({
        user_enrollment: { id: 'e-1' },
        completed_enrollment: false,
        quest_tasks: [
          { id: 't-1', title: 'Completed Task', is_completed: true },
          { id: 't-2', title: 'My Next Task', is_completed: false }
        ],
        progress: { percentage: 50 }
      })
      expect(screen.getByText('My Next Task')).toBeInTheDocument()
    })

    it('shows rhythm display', () => {
      renderCard({
        user_enrollment: { id: 'e-1' },
        completed_enrollment: false,
        quest_tasks: [{ id: 't-1', title: 'Task', is_completed: false }],
        progress: { percentage: 0 }
      })
      expect(screen.getByText('Building Momentum')).toBeInTheDocument()
    })
  })

  describe('completed state', () => {
    it('shows View on Diploma button', () => {
      renderCard({
        user_enrollment: { id: 'e-1' },
        completed_enrollment: true,
        quest_tasks: [{ id: 't-1', title: 'Task 1', is_completed: true }],
        progress: { percentage: 100 }
      })
      expect(screen.getByText('View on Diploma')).toBeInTheDocument()
    })
  })

  // --- Navigation ---
  describe('navigation', () => {
    it('navigates to quest detail on card click', () => {
      renderCard({ id: 'quest-abc' })
      fireEvent.click(screen.getByText('Test Quest').closest('[class*="cursor-pointer"]'))
      expect(mockNavigate).toHaveBeenCalledWith('/quests/quest-abc')
    })
  })
})
