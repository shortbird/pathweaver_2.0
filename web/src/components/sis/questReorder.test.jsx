/**
 * Moving quests and tasks up and down, and attaching to the master quest.
 *
 * iCreate, 2026-09-14 (c7d1f7a5), three asks in one report:
 *   - "I would also really like to be able to move the quests up and down."
 *   - "when you edit a quest, you can't move the tasks up and down. You can
 *      only do that when you first create the quest."
 *   - "I know you added the ability to add resources and links to the quests
 *      somewhere, but I can't do that currently under curriculum."
 *
 * The task list goes to the server whole and in order (a single move is not
 * accepted -- see utils.template_tasks.reorder_template_tasks). The quest list
 * already went whole through the PUT; the arrows only change the order it is
 * sent in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CurriculumResources from './CurriculumResources'
import PresetTaskManager from './PresetTaskManager'

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

const task = (id, title, order_index) => ({
  id, title, description: '', pillar: 'art', xp_value: 50, is_required: true, order_index,
})
const TASKS = [task('t1', 'Sketch', 0), task('t2', 'Paint', 1), task('t3', 'Frame', 2)]

describe('reordering preset tasks', () => {
  beforeEach(() => vi.clearAllMocks())

  const mount = async (editable = true) => {
    api.get.mockResolvedValue({ data: { success: true, editable, tasks: TASKS } })
    render(<PresetTaskManager base="/api/sis/curriculum/cur1/quests/q1/tasks" orgId="org1" questId="q1" />)
    await screen.findByText('Paint')
  }

  it('sends the whole list in its new order when a task moves up', async () => {
    await mount()
    api.put.mockResolvedValue({ data: { success: true, tasks: [TASKS[1], TASKS[0], TASKS[2]] } })
    fireEvent.click(screen.getByLabelText('Move Paint up'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/curriculum/cur1/quests/q1/tasks/order?organization_id=org1',
      { task_ids: ['t2', 't1', 't3'] }))
  })

  it('the first task cannot go up and the last cannot go down', async () => {
    await mount()
    expect(screen.getByLabelText('Move Sketch up')).toBeDisabled()
    expect(screen.getByLabelText('Move Frame down')).toBeDisabled()
    expect(screen.getByLabelText('Move Paint down')).not.toBeDisabled()
  })

  it('puts the list back and says so when the server refuses', async () => {
    await mount()
    api.put.mockRejectedValue({ response: { data: { error: 'That is not the full task list' } } })
    fireEvent.click(screen.getByLabelText('Move Frame up'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('That is not the full task list'))
    const titles = [...document.querySelectorAll('li .truncate')].map((el) => el.textContent)
    expect(titles).toEqual(['Sketch', 'Paint', 'Frame'])
  })

  it('offers no arrows on a library quest', async () => {
    await mount(false)
    expect(screen.queryByLabelText('Move Paint up')).not.toBeInTheDocument()
  })
})

describe('reordering the quests on a curriculum, and the master quest\'s resources', () => {
  beforeEach(() => vi.clearAllMocks())
  const QUESTS = [{ id: 'q1', title: 'Alpha' }, { id: 'q2', title: 'Beta' }, { id: 'q3', title: 'Gamma' }]

  const mount = async () => {
    api.get.mockImplementation(async (url) => {
      if (url.includes('/api/sis/quests/')) return { data: { success: true, quest: [], by_task: {} } }
      if (url.includes('/curriculum/cur1/resources')) return { data: { success: true, quests: QUESTS } }
      if (url.includes('/assignable-quests')) return { data: { success: true, quests: [] } }
      if (url.includes('/curricula')) return { data: { on: [], available: [] } }
      if (url.includes('/quests/q1/tasks')) {
        return { data: { success: true, editable: true, quest: { id: 'q1', title: 'Alpha', description: '' }, tasks: [] } }
      }
      return { data: { success: true } }
    })
    render(<CurriculumResources orgId="org1" curriculumId="cur1" canManage onChanged={vi.fn()} />)
    await screen.findByText('Beta')
  }

  it('re-sends the quest set in the new order when one moves down', async () => {
    await mount()
    api.put.mockResolvedValue({ data: { success: true, pushed_to_classes: 0 } })
    fireEvent.click(screen.getByLabelText('Move Alpha down'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      expect.stringContaining('/curriculum/cur1/quests'),
      { quest_ids: ['q2', 'q1', 'q3'] }))
    const titles = [...document.querySelectorAll('li span.truncate')].map((el) => el.textContent)
    expect(titles).toEqual(['Beta', 'Alpha', 'Gamma'])
  })

  it('shows the resources panel on the quest itself, not only on a class', async () => {
    await mount()
    fireEvent.click(screen.getByText('Alpha'))
    expect(await screen.findByText('Resources')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/quests/q1/resources')
  })
})
