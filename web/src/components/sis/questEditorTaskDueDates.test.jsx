/**
 * A due date on each task of a class quest, from the SIS quest editor.
 *
 * iCreate, ticket 26c91e25 (Karina): "it isn't possible to create a Quest like
 * 'Out of the Dust' and then have different due dates for each week's reading
 * assignment." Opened from a class, every saved task gets an optional date
 * input that saves straight to
 * PUT /api/sis/classes/<class>/quests/<quest>/tasks/<task>/due-date -- on the
 * office's read-only quests too, because the date is the class's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import QuestEditor from './QuestEditor'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => (orgId ? `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}` : url),
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../../hooks/api/useSisStaff', () => ({ useSisStaff: () => ({ data: [] }) }))

const task = (id, title) => ({
  id, title, description: '', pillar: 'communication', xp_value: 50, is_required: true,
  diploma_subjects: ['language_arts'], subject_xp_distribution: { language_arts: 50 },
})

const QUEST = {
  id: 'q1', title: 'Out of the Dust', description: '', header_image_url: '', is_active: true,
  is_draft: false, draft: null, is_library: false, xp_threshold: 0, teachers_may_change_xp: true,
  allow_custom_tasks: true, editable: true, can_lock_xp: false,
  tasks: [task('t1', 'Chapters 1-5'), task('t2', 'Chapters 6-10'), task('t3', 'Chapters 11-15')],
}
const LINK = { due_date: null, publish_at: null, student_ids: null }
const TASK_URL = '/api/sis/classes/c1/quests/q1/tasks'

let current = QUEST
beforeEach(() => {
  vi.clearAllMocks()
  current = QUEST
  api.get.mockImplementation(async (url) => {
    if (url.includes('/resources')) return { data: { quest: [], by_task: {} } }
    if (url.startsWith(TASK_URL)) {
      return { data: { success: true, tasks: [
        { id: 't1', due_date: null },
        { id: 't2', due_date: '2026-10-09T23:59:59+00:00' },
        { id: 't3', due_date: null },
      ] } }
    }
    return { data: { quest: current } }
  })
  api.put.mockResolvedValue({ data: { success: true } })
  api.patch.mockResolvedValue({ data: { success: true } })
})

const open = async (props = {}) => {
  render(<QuestEditor context="class" classId="c1" questId="q1" classLink={LINK}
    onClose={vi.fn()} onDone={vi.fn()} {...props} />)
  await screen.findByRole('dialog')
}

describe('a date on each task, for this class (26c91e25)', () => {
  it('shows each task\'s date from the class task list', async () => {
    await open()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(TASK_URL))
    expect(await screen.findByLabelText('Task 1 due date')).toHaveValue('')
    await waitFor(() => expect(screen.getByLabelText('Task 2 due date').value).toMatch(/^2026-10-(09|10)$/))
  })

  it('saves a date straight to the per-task route, end of that day', async () => {
    await open()
    fireEvent.change(await screen.findByLabelText('Task 1 due date'), { target: { value: '2026-10-02' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1/tasks/t1/due-date',
      { due_date: expect.stringMatching(/^2026-10-0[23]T/) }))
    const iso = api.put.mock.calls.at(-1)[1].due_date
    const local = new Date(iso)
    expect([local.getHours(), local.getMinutes()]).toEqual([23, 59])
    expect(toast.success).toHaveBeenCalledWith('Task due date saved')
  })

  it('clears a date with null', async () => {
    await open()
    const input = await screen.findByLabelText('Task 2 due date')
    await waitFor(() => expect(input.value).not.toBe(''))
    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1/tasks/t2/due-date', { due_date: null }))
  })

  it('works on the office\'s read-only quest', async () => {
    current = { ...QUEST, editable: false, created_by: 'the-office' }
    await open()
    expect(screen.queryByLabelText('Quest title')).toBeNull()
    fireEvent.change(await screen.findByLabelText('Task 3 due date'), { target: { value: '2026-10-16' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1/tasks/t3/due-date',
      { due_date: expect.stringMatching(/^2026-10-1[67]T/) }))
  })

  it('puts the old date back and says why when the school has due dates off', async () => {
    api.put.mockRejectedValueOnce({ response: { data: { error: 'Due dates are not enabled for this organization' } } })
    await open()
    const input = await screen.findByLabelText('Task 1 due date')
    fireEvent.change(input, { target: { value: '2026-10-02' } })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Due dates are not enabled for this organization'))
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('a task typed in and not saved has no date input until it has an id', async () => {
    await open()
    await screen.findByLabelText('Task 3 due date')
    fireEvent.click(screen.getByRole('button', { name: /Add a preset task/ }))
    fireEvent.change(screen.getByPlaceholderText(/Task 4 /), { target: { value: 'Chapters 16-20' } })
    expect(screen.queryByLabelText('Task 4 due date')).toBeNull()
  })

  it('is not offered outside a class, or on a quest not yet on the class', async () => {
    await open({ context: 'library', classId: null, classLink: null })
    await screen.findByLabelText('Quest title')
    expect(screen.queryByLabelText('Task 1 due date')).toBeNull()
    expect(api.get).not.toHaveBeenCalledWith(TASK_URL)
  })
})
