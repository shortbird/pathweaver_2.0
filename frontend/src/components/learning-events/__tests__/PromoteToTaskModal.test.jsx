import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AddToQuestModal, { DEFAULT_PROMOTED_TASK_XP } from '../PromoteToTaskModal'
import api from '../../../services/api'

vi.mock('../../../services/api', () => ({
  default: {
    post: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const moment = { id: 'moment-1', title: 'My moment', pillars: ['stem'] }

describe('AddToQuestModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.post.mockResolvedValue({
      data: { success: true, task: { id: 'new-task', quest_id: 'quest-1' }, message: 'Added!' },
    })
  })

  it('exports a default XP constant of 50', () => {
    expect(DEFAULT_PROMOTED_TASK_XP).toBe(50)
  })

  it('renders nothing without a quest', () => {
    const { container } = render(
      <AddToQuestModal isOpen onClose={() => {}} moment={moment} quest={null} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('defaults XP to 50 and posts diploma_subject null for a non-class quest', async () => {
    const onSuccess = vi.fn()
    render(
      <AddToQuestModal
        isOpen
        onClose={() => {}}
        moment={moment}
        quest={{ id: 'quest-1', name: 'My Quest', quest_type: 'optio' }}
        onSuccess={onSuccess}
      />
    )
    expect(screen.getByText('50 XP')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add to quest/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith(
      '/api/learning-events/moment-1/convert-to-task',
      expect.objectContaining({ quest_id: 'quest-1', xp_value: 50, diploma_subject: null })
    )
    expect(onSuccess).toHaveBeenCalled()
  })

  it('locks the diploma credit to the class subject for a class quest', async () => {
    render(
      <AddToQuestModal
        isOpen
        onClose={() => {}}
        moment={moment}
        quest={{ id: 'quest-2', name: 'US History', quest_type: 'class', transcript_subject: 'social_studies' }}
      />
    )
    // Locked subject is shown; no editable subject dropdown.
    expect(screen.getByText('Social Studies')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add to quest/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const payload = api.post.mock.calls[0][1]
    expect(payload.quest_id).toBe('quest-2')
    expect(payload.diploma_subject).toBeUndefined()
  })

  it('sends the chosen diploma subject for a non-class quest', async () => {
    render(
      <AddToQuestModal
        isOpen
        onClose={() => {}}
        moment={moment}
        quest={{ id: 'quest-1', name: 'My Quest', quest_type: 'optio' }}
      />
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'science' } })
    fireEvent.click(screen.getByRole('button', { name: /add to quest/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].diploma_subject).toBe('science')
  })
})
