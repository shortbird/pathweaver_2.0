import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RequestXpModal from '../RequestXpModal'
import api from '../../../services/api'

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

describe('RequestXpModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders both paths on the choose step', () => {
    render(
      <RequestXpModal
        isOpen
        onClose={() => {}}
        moment={{
          id: 'moment-1',
          topics: [{ type: 'topic', id: 'track-1', name: 'Coding' }],
        }}
      />
    )
    expect(screen.getByText(/attach to one of my active quests/i)).toBeInTheDocument()
    expect(screen.getByText(/evolve a topic into a quest/i)).toBeInTheDocument()
  })

  it('disables the evolve path when the moment has no topics', () => {
    render(
      <RequestXpModal
        isOpen
        onClose={() => {}}
        moment={{ id: 'moment-1', topics: [] }}
      />
    )
    const evolveButton = screen.getByRole('button', { name: /evolve a topic into a quest/i })
    expect(evolveButton).toBeDisabled()
  })

  it('attaches to the chosen quest, then fires onAttachAndPromote', async () => {
    api.get.mockResolvedValue({
      data: {
        success: true,
        topics: [
          { type: 'quest', id: 'quest-1', name: 'My Quest' },
        ],
        course_topics: [],
      },
    })
    api.post.mockResolvedValue({ data: { success: true } })

    const onAttachAndPromote = vi.fn()
    render(
      <RequestXpModal
        isOpen
        onClose={() => {}}
        moment={{
          id: 'moment-1',
          topics: [{ type: 'topic', id: 'track-1', name: 'Coding' }],
        }}
        onAttachAndPromote={onAttachAndPromote}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /attach to one of my active quests/i }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/topics/unified'))

    fireEvent.click(await screen.findByRole('button', { name: 'My Quest' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith(
      '/api/learning-events/moment-1/assign-topic',
      expect.objectContaining({
        type: 'quest',
        topic_id: 'quest-1',
        action: 'add',
      })
    )
    expect(onAttachAndPromote).toHaveBeenCalledWith({
      questId: 'quest-1',
      questName: 'My Quest',
    })
  })

  it('with one topic, evolve path fires onEvolveTopic immediately', () => {
    const onEvolveTopic = vi.fn()
    const onClose = vi.fn()
    render(
      <RequestXpModal
        isOpen
        onClose={onClose}
        moment={{
          id: 'moment-1',
          topics: [{ type: 'topic', id: 'track-1', name: 'Coding' }],
        }}
        onEvolveTopic={onEvolveTopic}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /evolve a topic into a quest/i }))
    expect(onEvolveTopic).toHaveBeenCalledWith({ id: 'track-1', name: 'Coding' })
    expect(onClose).toHaveBeenCalled()
  })

  it('with multiple topics, evolve path opens topic picker', () => {
    render(
      <RequestXpModal
        isOpen
        onClose={() => {}}
        moment={{
          id: 'moment-1',
          topics: [
            { type: 'topic', id: 'track-1', name: 'Coding' },
            { type: 'topic', id: 'track-2', name: 'Music' },
          ],
        }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /evolve a topic into a quest/i }))
    expect(screen.getByRole('button', { name: 'Coding' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument()
  })
})
