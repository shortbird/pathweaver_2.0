import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LearningEventCard from '../LearningEventCard'
import api from '../../../services/api'

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
    delete: vi.fn(),
  },
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

// The merged "Add to quest" modal (file kept as PromoteToTaskModal).
vi.mock('../PromoteToTaskModal', () => ({
  default: ({ isOpen, quest }) =>
    isOpen ? <div data-testid="add-quest-modal" data-quest-id={quest?.id || ''} /> : null,
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

describe('LearningEventCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { success: true, topics: [], course_topics: [] } })
    api.post.mockResolvedValue({ data: { success: true } })
  })

  it('shows "Add to quest" and no XP CTA when the moment is unassigned', () => {
    renderCard({ ...baseEvent, topics: [] })
    expect(screen.getByRole('button', { name: /add to quest/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view in quest/i })).not.toBeInTheDocument()
  })

  it('shows "View in quest" when promoted_task is set, and clicking navigates to that quest', () => {
    renderCard({
      ...baseEvent,
      topics: [{ type: 'quest', id: 'quest-1', name: 'My Quest' }],
      promoted_task: { id: 'task-1', title: 'Promoted task', quest_id: 'quest-1' },
    })
    const button = screen.getByRole('button', { name: /view in quest/i })
    fireEvent.click(button)
    expect(mockNavigate).toHaveBeenCalledWith('/quests/quest-1')
  })

  it('opens the Add-to-quest modal when a quest is picked from the dropdown', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        topics: [{ type: 'quest', id: 'quest-9', name: 'Robotics', quest_type: 'optio' }],
        course_topics: [],
      },
    })
    renderCard({ ...baseEvent, topics: [] })
    fireEvent.click(screen.getByRole('button', { name: /add to quest/i }))

    const questBtn = await screen.findByRole('button', { name: /robotics/i })
    fireEvent.click(questBtn)

    const modal = await screen.findByTestId('add-quest-modal')
    expect(modal.dataset.questId).toBe('quest-9')
  })

  it('unassigns a quest chip back to unassigned', async () => {
    renderCard({
      ...baseEvent,
      topics: [{ type: 'quest', id: 'quest-1', name: 'My Quest' }],
    })
    fireEvent.click(screen.getByRole('button', { name: /move back to unassigned/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith(
      '/api/learning-events/moment-1/assign-topic',
      expect.objectContaining({ type: 'quest', topic_id: 'quest-1', action: 'remove' })
    )
  })

  it('hides XP actions and unassign in parent view (studentId set)', () => {
    renderCard(
      { ...baseEvent, topics: [{ type: 'quest', id: 'quest-1', name: 'My Quest' }] },
      { studentId: 'child-id' }
    )
    expect(screen.queryByRole('button', { name: /view in quest/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /move back to unassigned/i })).not.toBeInTheDocument()
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
