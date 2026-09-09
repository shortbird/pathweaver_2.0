import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * "XP to finish" on a class quest.
 *
 * iCreate asked four times in a week, and each time reached for the XP box on a
 * preset task, which is that task's value and not a target for the quest:
 *
 *   2026-09-01  "I would like to have an option to add an XP minimum for each quest."
 *   2026-09-01  "I can update the required XP for this quest, but I can't save it."
 *   2026-09-01  "Oops, the XP was to add my own preset task. I was hoping to have
 *                a required amount of XP for the entire quest."
 *   2026-09-03  "There is no way to save the XP. It was originally 100, but I
 *                need to change it to 50." (Nicole Connole)
 *
 * The number itself is quests.xp_threshold, which POST /api/quests/:id/end has
 * enforced all along — nothing on the class page could write it.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import ClassQuestsManager from './ClassQuestsManager'
import { withConfirm } from '../../tests/confirmTestUtils'

const quest = (extra = {}) => ({
  quest_id: 'q1', title: 'Reading Appreciation', template_task_count: 1,
  editable_tasks: true, due_date: null, xp_threshold: 0, ...extra,
})

const mockQuests = (quests) => api.get.mockImplementation((url) => (
  url.includes('/quests') && !url.includes('assignable')
    ? Promise.resolve({ data: { quests } })
    : Promise.resolve({ data: { quests: [] } })
))

const xpBox = () => screen.getByLabelText('XP to finish Reading Appreciation')

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true } })
})

describe('ClassQuestsManager XP to finish', () => {
  it('saves a quest-level target, on the quest and not on a task', async () => {
    mockQuests([quest()])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.blur(await screen.findByLabelText('XP to finish Reading Appreciation'),
      { target: { value: '50' } })

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch.mock.calls[0]).toEqual([
      '/api/sis/classes/c1/quests/q1', { xp_threshold: 50 },
    ])
  })

  it('shows the saved target back on the row', async () => {
    mockQuests([quest({ xp_threshold: 300 })])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    expect(await screen.findByText(/300 XP to finish/)).toBeInTheDocument()
    expect(xpBox()).toHaveValue(300)
  })

  it('clears the requirement when the box is emptied', async () => {
    mockQuests([quest({ xp_threshold: 100 })])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.blur(await screen.findByLabelText('XP to finish Reading Appreciation'),
      { target: { value: '' } })

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch.mock.calls[0][1]).toEqual({ xp_threshold: 0 })
  })

  it('does not write when the number has not changed', async () => {
    mockQuests([quest({ xp_threshold: 100 })])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    fireEvent.blur(await screen.findByLabelText('XP to finish Reading Appreciation'),
      { target: { value: '100' } })

    await new Promise((r) => setTimeout(r, 0))
    expect(api.patch).not.toHaveBeenCalled()
  })

  // A library quest is shared with every school, so its finish line is not one
  // school's to set — the backend refuses, and the control is not drawn.
  it('offers no box on an Optio-library quest', async () => {
    mockQuests([quest({ editable_tasks: false })])
    render(withConfirm(<ClassQuestsManager classId="c1" />))

    await screen.findByText('Reading Appreciation')
    expect(screen.queryByLabelText('XP to finish Reading Appreciation')).not.toBeInTheDocument()
  })
})
