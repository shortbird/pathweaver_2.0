import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PromoteToTaskModal, { DEFAULT_PROMOTED_TASK_XP } from '../PromoteToTaskModal'
import api from '../../../services/api'

vi.mock('../../../services/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

describe('PromoteToTaskModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({
      data: { success: true, task: { id: 'new-task' }, message: 'Created!' },
    })
  })

  it('exports a default XP constant of 50', () => {
    expect(DEFAULT_PROMOTED_TASK_XP).toBe(50)
  })

  it('defaults the XP slider to 50 when opened', () => {
    render(
      <PromoteToTaskModal
        isOpen
        onClose={() => {}}
        moment={{
          id: 'moment-1',
          title: 'My moment',
          pillars: ['stem'],
          topics: [{ type: 'quest', id: 'quest-1', name: 'My Quest' }],
        }}
      />
    )
    expect(screen.getByText('50 XP')).toBeInTheDocument()
  })

  it('skips the picker and posts with the only quest when moment has one quest', async () => {
    const onSuccess = vi.fn()
    render(
      <PromoteToTaskModal
        isOpen
        onClose={() => {}}
        moment={{
          id: 'moment-1',
          title: 'My moment',
          topics: [{ type: 'quest', id: 'quest-1', name: 'My Quest' }],
        }}
        onSuccess={onSuccess}
      />
    )
    expect(screen.queryByText(/multiple quests/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /create task/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith(
      '/api/learning-events/moment-1/convert-to-task',
      expect.objectContaining({
        quest_id: 'quest-1',
        xp_value: 50,
      })
    )
    expect(onSuccess).toHaveBeenCalled()
  })

  it('shows the picker first when moment has multiple quests', () => {
    render(
      <PromoteToTaskModal
        isOpen
        onClose={() => {}}
        moment={{
          id: 'moment-1',
          topics: [
            { type: 'quest', id: 'quest-a', name: 'Quest A' },
            { type: 'quest', id: 'quest-b', name: 'Quest B' },
          ],
        }}
      />
    )
    expect(screen.getByText(/multiple quests/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quest A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quest B' })).toBeInTheDocument()
  })

  it('respects presetQuestId for multi-quest moments and skips the picker', async () => {
    render(
      <PromoteToTaskModal
        isOpen
        onClose={() => {}}
        presetQuestId="quest-b"
        moment={{
          id: 'moment-1',
          topics: [
            { type: 'quest', id: 'quest-a', name: 'Quest A' },
            { type: 'quest', id: 'quest-b', name: 'Quest B' },
          ],
        }}
      />
    )
    expect(screen.queryByText(/multiple quests/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /create task/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1]).toEqual(
      expect.objectContaining({ quest_id: 'quest-b' })
    )
  })
})
