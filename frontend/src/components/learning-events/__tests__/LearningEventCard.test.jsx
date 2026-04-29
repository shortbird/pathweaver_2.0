import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LearningEventCard from '../LearningEventCard'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../LearningEventDetailModal', () => ({
  default: () => null,
}))

vi.mock('../PromoteToTaskModal', () => ({
  default: ({ isOpen, presetQuestId, moment }) =>
    isOpen ? (
      <div data-testid="promote-modal" data-preset-quest-id={presetQuestId || ''} data-moment-id={moment?.id || ''} />
    ) : null,
}))
vi.mock('../RequestXpModal', () => ({
  default: ({ isOpen }) =>
    isOpen ? <div data-testid="request-xp-modal" /> : null,
}))
vi.mock('../../interest-tracks/EvolveTopicModal', () => ({
  default: ({ isOpen }) =>
    isOpen ? <div data-testid="evolve-modal" /> : null,
}))

const baseEvent = {
  id: 'moment-1',
  description: 'I learned a thing',
  pillars: [],
  evidence_blocks: [],
  created_at: '2026-04-29T00:00:00Z',
}

const renderCard = (event, props = {}) =>
  render(
    <MemoryRouter>
      <LearningEventCard event={event} {...props} />
    </MemoryRouter>
  )

describe('LearningEventCard XP CTAs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Promote to task" when the moment has at least one quest and no promoted_task', () => {
    renderCard({
      ...baseEvent,
      topics: [{ type: 'quest', id: 'quest-1', name: 'My Quest' }],
    })
    const button = screen.getByRole('button', { name: /promote to task/i })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    const modal = screen.getByTestId('promote-modal')
    expect(modal).toBeInTheDocument()
    expect(modal.dataset.momentId).toBe('moment-1')
  })

  it('shows "View in quest" when promoted_task is set, and clicking navigates to that quest', () => {
    renderCard({
      ...baseEvent,
      topics: [{ type: 'quest', id: 'quest-1', name: 'My Quest' }],
      promoted_task: {
        id: 'task-1',
        title: 'Promoted task',
        quest_id: 'quest-1',
        quest_title: 'My Quest',
      },
    })
    const button = screen.getByRole('button', { name: /view in quest/i })
    expect(button).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /promote to task/i })).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/quests/quest-1')
  })

  it('shows "Request XP" when the moment is in a topic with no quest attached', () => {
    renderCard({
      ...baseEvent,
      topics: [{ type: 'topic', id: 'track-1', name: 'Coding' }],
    })
    const button = screen.getByRole('button', { name: /request xp/i })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.getByTestId('request-xp-modal')).toBeInTheDocument()
  })

  it('shows "Add to Topic" only and no XP CTA when the moment is unassigned', () => {
    renderCard({
      ...baseEvent,
      topics: [],
    })
    expect(screen.getByRole('button', { name: /add to topic/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /promote to task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request xp/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view in quest/i })).not.toBeInTheDocument()
  })

  it('does not show XP CTAs in parent view (studentId set)', () => {
    renderCard(
      {
        ...baseEvent,
        topics: [{ type: 'quest', id: 'quest-1', name: 'My Quest' }],
      },
      { studentId: 'child-id' }
    )
    expect(screen.queryByRole('button', { name: /promote to task/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request xp/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view in quest/i })).not.toBeInTheDocument()
  })

  it('renders topic chips from the topics array', () => {
    renderCard({
      ...baseEvent,
      topics: [
        { type: 'topic', id: 'track-1', name: 'Coding', color: '#abc' },
        { type: 'quest', id: 'quest-1', name: 'Build a robot' },
      ],
    })
    expect(screen.getByText('Coding')).toBeInTheDocument()
    expect(screen.getByText('Build a robot')).toBeInTheDocument()
  })
})
