import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * A teacher edits the quest itself from the class page.
 *
 * iCreate, 93af5014, 2026-09-22: "Teachers can't seem to edit the quests. Once
 * they can edit, they should be able to select whether or not students can add
 * tasks. I don't think we want the 'Save this class's quests to the curriculum.'"
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('./PresetTaskManager', () => ({ default: () => <div /> }))
vi.mock('./QuestResourcesPanel', () => ({ default: () => <div /> }))

import ClassQuestsManager from './ClassQuestsManager'
import { withConfirm } from '../../tests/confirmTestUtils'

const quest = (extra = {}) => ({
  quest_id: 'q1', title: 'Week 4 THINK', description: 'Math.', template_task_count: 1,
  editable_tasks: true, allow_custom_tasks: true, due_date: null, xp_threshold: 0, ...extra,
})

const mock = (quests) => api.get.mockImplementation((url) => {
  if (url.includes('curriculum-quests')) {
    return Promise.resolve({ data: { curricula: [
      { curriculum_id: 'cur1', title: 'ALD Elem', quests: [{ quest_id: 'q1' }], missing_count: 0 },
    ] } })
  }
  if (url.includes('/quests') && !url.includes('assignable')) return Promise.resolve({ data: { quests } })
  return Promise.resolve({ data: { quests: [] } })
})

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true, quest: {
    id: 'q1', title: 'Week 4 THINK (Math)', description: 'Math.', allow_custom_tasks: false,
  } } })
})

describe('ClassQuestsManager quest details', () => {
  it('saves the title and the student-tasks switch through the class-scoped route', async () => {
    mock([quest()])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    fireEvent.click(await screen.findByLabelText('Toggle tasks'))

    fireEvent.change(screen.getByLabelText('Quest title'), { target: { value: 'Week 4 THINK (Math)' } })
    fireEvent.click(screen.getByLabelText('Students can add their own tasks'))
    fireEvent.click(screen.getByRole('button', { name: 'Save quest' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1/quests/q1/info', {
      title: 'Week 4 THINK (Math)', description: 'Math.', allow_custom_tasks: false,
    }))
    expect(await screen.findByText('Week 4 THINK (Math)')).toBeInTheDocument()
  })

  it('offers no editor on an Optio library quest', async () => {
    mock([quest({ editable_tasks: false })])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    fireEvent.click(await screen.findByLabelText('Toggle tasks'))
    expect(screen.queryByLabelText('Quest title')).toBeNull()
  })

  it('does not offer a teacher the save-to-curriculum button', async () => {
    mock([quest()])
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    expect(await screen.findByText('ALD Elem')).toBeInTheDocument()
    expect(screen.queryByText(/Save this class.s quests to the curriculum/)).toBeNull()
  })

  it('still offers it to the office', async () => {
    mock([quest()])
    render(withConfirm(<ClassQuestsManager classId="c1" canSaveToCurriculum />))
    expect(await screen.findByText(/Save this class.s quests to the curriculum/)).toBeInTheDocument()
  })
})
