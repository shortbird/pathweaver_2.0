/**
 * Duplicating a quest, and duplicating one preset task.
 *
 * iCreate, 2026-09-07, twice in half an hour on the same screen:
 *   45c7ced1  "Can I please duplicate quests so I don't have to start over
 *              every time?"
 *   4da3680d  "I'd also like to be able to duplicate tasks."
 *
 * Two rules the UI carries that the API cannot:
 *   - Duplicate is offered on an Optio-library quest even though Edit and
 *     Delete are not. The copy comes back owned by the school, so copying is
 *     the only route to an editable version of a library quest — hiding the
 *     button behind `editable` would close that door.
 *   - After a quest is duplicated the whole library is re-read. The copy is a
 *     new row this panel has never seen; without the reload it appears only on
 *     the next page load, which reads as "the button did nothing".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))

import CurriculumResources from './CurriculumResources'
import PresetTaskManager from './PresetTaskManager'

const QUEST = { id: 'q1', title: 'Watercolor Basics', can_manage: true }
const TASK = {
  id: 't1', title: 'Sketch your design', description: '', pillar: 'art',
  xp_value: 75, is_required: true, order_index: 0,
}

const routeGet = (url, { editable = true, quests = [QUEST] } = {}) => {
  if (url.includes('/resources')) return { data: { success: true, quests } }
  if (url.includes('/assignable-quests')) return { data: { success: true, quests: [] } }
  if (url.includes('/curricula')) return { data: { on: [], available: [] } }
  if (url.includes(`/quests/${QUEST.id}`)) {
    return {
      data: {
        success: true, editable,
        quest: { ...QUEST, description: 'Paint.' },
        tasks: [TASK],
      },
    }
  }
  return { data: { success: true } }
}

const openQuest = async (opts) => {
  api.get.mockImplementation(async (url) => routeGet(url, opts))
  render(<CurriculumResources orgId="org1" curriculumId="cur-academic" canManage
    onChanged={vi.fn()} />)
  await screen.findByText(QUEST.title)
  fireEvent.click(screen.getByText(QUEST.title))
  return screen.findByLabelText(`Duplicate ${QUEST.title}`)
}

describe('duplicating a quest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copies the quest and names the copy in the confirmation', async () => {
    const button = await openQuest()
    api.post.mockResolvedValue({
      data: { success: true, quest_id: 'q2', title: 'Watercolor Basics (copy)', task_count: 1 },
    })

    fireEvent.click(button)

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      expect.stringContaining(`/curriculum/cur-academic/quests/${QUEST.id}/duplicate`), {}))
    // The generated name is the server's, so the teacher is told what it is
    // rather than left to find it in the list.
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Copied as "Watercolor Basics (copy)"'))
  })

  it('re-reads the library so the copy actually appears', async () => {
    const button = await openQuest()
    api.post.mockResolvedValue({ data: { success: true, quest_id: 'q2', title: 'X (copy)' } })
    const before = api.get.mock.calls.filter(([u]) => u.includes('/resources')).length

    fireEvent.click(button)

    await waitFor(() => expect(
      api.get.mock.calls.filter(([u]) => u.includes('/resources')).length,
    ).toBeGreaterThan(before))
  })

  it('is offered on a library quest, which cannot be edited or deleted', async () => {
    await openQuest({ editable: false })
    expect(screen.getByLabelText(`Duplicate ${QUEST.title}`)).toBeInTheDocument()
    expect(screen.queryByText('Delete this quest entirely')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(`Edit ${QUEST.title}`)).not.toBeInTheDocument()
  })

  it('reports a refusal instead of pretending it copied', async () => {
    const button = await openQuest()
    api.post.mockRejectedValue({ response: { data: { error: 'Quest not found.' } } })

    fireEvent.click(button)

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Quest not found.'))
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('duplicating a preset task', () => {
  beforeEach(() => vi.clearAllMocks())

  const mountTasks = async ({ editable = true } = {}) => {
    api.get.mockResolvedValue({ data: { success: true, editable, tasks: [TASK] } })
    render(<PresetTaskManager base="/api/sis/curriculum/cur-academic/quests/q1/tasks" />)
    return screen.findByText(TASK.title)
  }

  it('posts to the task and appends the copy to the list', async () => {
    await mountTasks()
    api.post.mockResolvedValue({
      data: { success: true, task: { ...TASK, id: 't2', order_index: 1 } },
    })

    fireEvent.click(screen.getByLabelText(`Duplicate ${TASK.title}`))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      `/api/sis/curriculum/cur-academic/quests/q1/tasks/${TASK.id}/duplicate`, {}))
    // Two rows with the same title: the copy is deliberately not renamed, so
    // the count is what proves it landed.
    await waitFor(() => expect(screen.getAllByText(TASK.title)).toHaveLength(2))
  })

  it('leaves the list alone when the copy is refused', async () => {
    await mountTasks()
    api.post.mockRejectedValue({ response: { data: { error: 'Task not found.' } } })

    fireEvent.click(screen.getByLabelText(`Duplicate ${TASK.title}`))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Task not found.'))
    expect(screen.getAllByText(TASK.title)).toHaveLength(1)
  })

  it('is not offered on a library quest, whose tasks are shared', async () => {
    // Unlike the quest copy, this one writes INTO the shared quest.
    await mountTasks({ editable: false })
    expect(screen.queryByLabelText(`Duplicate ${TASK.title}`)).not.toBeInTheDocument()
  })
})
