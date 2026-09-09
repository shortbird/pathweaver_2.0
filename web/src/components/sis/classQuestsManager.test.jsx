import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ClassQuestsManager from './ClassQuestsManager'
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

const OWN_QUEST = {
  quest_id: 'q1', title: 'Bridge Building', template_task_count: 2, editable_tasks: true,
}
const LIBRARY_QUEST = {
  quest_id: 'q2', title: 'Optio Poetry', template_task_count: 0, editable_tasks: false,
}

const mockQuests = (quests) => api.get.mockImplementation((url) => (
  url.includes('/quests') && !url.includes('assignable')
    ? Promise.resolve({ data: { quests } })
    : Promise.resolve({ data: { quests: [] } })
))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClassQuestsManager unassign vs delete', () => {
  it('unassign takes the quest off the class but keeps it in the library', async () => {
    mockQuests([OWN_QUEST])
    api.delete.mockResolvedValue({ data: { success: true } })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }))
    // The confirm must say the quest survives, or the two actions read alike.
    expect(await confirmText()).toMatch(/stays in your school's library/)
    await answerConfirm()

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1'))
  })

  it('delete removes it from the library, on a separate endpoint', async () => {
    mockQuests([OWN_QUEST])
    api.delete.mockResolvedValue({ data: { success: true } })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.click(await screen.findByRole('button', { name: /Delete Bridge Building/i }))
    expect(await confirmText()).toMatch(/can't be undone/i)
    await answerConfirm()

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1/delete'))
  })

  it('offers no delete for Optio library quests — they are shared', async () => {
    mockQuests([LIBRARY_QUEST])
    render(<ClassQuestsManager classId="c1" />)

    expect(await screen.findByRole('button', { name: 'Unassign' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete Optio Poetry/i })).not.toBeInTheDocument()
  })

  it('cancelling the confirm leaves the quest alone', async () => {
    mockQuests([OWN_QUEST])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }))
    await answerConfirm(false)

    expect(api.delete).not.toHaveBeenCalled()
  })

  it('surfaces the refusal when students have already started the quest', async () => {
    const { toast } = await import('react-hot-toast')
    mockQuests([OWN_QUEST])
    api.delete.mockRejectedValue({
      response: { status: 409, data: { error: '3 students have already started this quest' } },
    })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.click(await screen.findByRole('button', { name: /Delete Bridge Building/i }))
    await answerConfirm()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('3 students have already started this quest'))
    // Still listed — a failed delete must not look like it worked.
    expect(screen.getByText('Bridge Building')).toBeInTheDocument()
  })

  // iCreate, 2026-07-30: a teacher wanted a quest she started last year gone.
  // Delete only existed on quests attached to a class, so an abandoned draft
  // that was never assigned had no way out.
  it('deletes an unassigned quest from the assign picker', async () => {
    api.get.mockImplementation((url) => (
      url.includes('assignable')
        ? Promise.resolve({ data: { quests: [{ ...OWN_QUEST, source: 'organization' }] } })
        : Promise.resolve({ data: { quests: [] } })
    ))
    api.delete.mockResolvedValue({ data: { success: true } })
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.click(await screen.findByRole('button', { name: 'Assign a quest' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await answerConfirm()

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1/delete'))
    await waitFor(() => expect(screen.queryByText('Bridge Building')).not.toBeInTheDocument())
  })

  it('offers no delete for library quests in the picker', async () => {
    api.get.mockImplementation((url) => (
      url.includes('assignable')
        ? Promise.resolve({ data: { quests: [{ ...LIBRARY_QUEST, source: 'library' }] } })
        : Promise.resolve({ data: { quests: [] } })
    ))
    render(<ClassQuestsManager classId="c1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Assign a quest' }))
    expect(await screen.findByRole('button', { name: 'Assign' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
