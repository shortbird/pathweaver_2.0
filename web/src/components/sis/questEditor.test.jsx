/**
 * QuestEditor, the one SIS quest form (P6, owner decision 2026-09-23).
 *
 * What these hold, beyond what the screen-level tests do:
 *   - the task list is saved whole and by id, so moving, duplicating and
 *     changing Required on a task edit that task rather than replace it
 *     (ported from PresetTaskManager, which this replaced: ea9756e3 Required,
 *     4da3680d duplicate, c7d1f7a5 reorder);
 *   - a task typed in but not saved can get its files after one click;
 *   - a teacher opening the office's quest from their class sees it read-only
 *     and keeps the class's own settings;
 *   - publishing on a class sends the class's dates and audience;
 *   - closing a blank new draft removes it, and closing one with words in it
 *     saves it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

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

import QuestEditor from './QuestEditor'

const task = (id, title, extra = {}) => ({
  id, title, description: '', pillar: 'art', xp_value: 50, is_required: true,
  diploma_subjects: ['fine_arts'], subject_xp_distribution: { fine_arts: 50 }, ...extra,
})

const QUEST = {
  id: 'q1', title: 'Watercolor', description: 'Paint.', header_image_url: '', is_active: true,
  is_draft: false, draft: null, is_library: false, xp_threshold: 0, teachers_may_change_xp: true,
  allow_custom_tasks: true, editable: true, can_lock_xp: false,
  tasks: [task('t1', 'Sketch'), task('t2', 'Paint'), task('t3', 'Frame')],
}

let current = QUEST
beforeEach(() => {
  vi.clearAllMocks()
  current = QUEST
  api.get.mockImplementation(async (url) => {
    if (url.includes('/resources')) return { data: { quest: [], by_task: {} } }
    return { data: { quest: current } }
  })
  api.put.mockImplementation(async (_url, body) => ({ data: { quest: {
    ...current, ...body, tasks: body.tasks.map((t, i) => ({ id: t.id || `new-${i}`, ...t })) } } }))
  api.post.mockResolvedValue({ data: { success: true, quest_id: 'q-new', students_enrolled: 4 } })
  api.patch.mockResolvedValue({ data: { success: true } })
  api.delete.mockResolvedValue({ data: { success: true } })
})

const open = async (props = {}) => {
  const onClose = vi.fn()
  const onDone = vi.fn()
  render(<QuestEditor context="class" classId="c1" questId="q1" onClose={onClose} onDone={onDone} {...props} />)
  await screen.findByRole('dialog')
  return { onClose, onDone }
}
const saveAndGetTasks = async (name = 'Save') => {
  fireEvent.click(screen.getByRole('button', { name }))
  await waitFor(() => expect(api.put).toHaveBeenCalled())
  return api.put.mock.calls.at(-1)[1].tasks
}

describe('the task list, saved whole and by id', () => {
  it('changes Required on an existing task without replacing it (ea9756e3)', async () => {
    await open()
    const boxes = await screen.findAllByRole('checkbox', { name: 'Required' })
    expect(boxes[0]).toBeChecked()
    fireEvent.click(boxes[0])
    const tasks = await saveAndGetTasks()
    expect(tasks[0]).toEqual(expect.objectContaining({ id: 't1', title: 'Sketch', is_required: false }))
  })

  it('moves a task up and sends the list in its new order, ids kept (c7d1f7a5)', async () => {
    await open()
    fireEvent.click(await screen.findByLabelText('Move task 2 up'))
    const tasks = await saveAndGetTasks()
    expect(tasks.map((t) => t.id)).toEqual(['t2', 't1', 't3'])
  })

  it('duplicates a task to the end of the list, as a new task (4da3680d)', async () => {
    await open()
    fireEvent.click(await screen.findByLabelText('Duplicate task 1'))
    const tasks = await saveAndGetTasks()
    expect(tasks).toHaveLength(4)
    expect(tasks[3]).toEqual(expect.objectContaining({ title: 'Sketch' }))
    expect(tasks[3]).not.toHaveProperty('id')
  })

  it('keeps each task\'s credit subjects', async () => {
    await open()
    const tasks = await saveAndGetTasks()
    expect(tasks[0].diploma_subjects).toEqual(['fine_arts'])
  })

  it('a new task gets its files after one click, which saves it', async () => {
    await open()
    fireEvent.click(await screen.findByRole('button', { name: /Add a preset task/ }))
    fireEvent.change(screen.getByPlaceholderText(/Task 4 /), { target: { value: 'Hang it' } })
    fireEvent.click(screen.getByRole('button', { name: /Save to add files and links to this task/ }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    // The saved task comes back with an id, so its attachments open.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/quests/q1/resources'))
    expect(screen.queryByRole('button', { name: /Save to add files and links to this task/ })).toBeNull()
  })
})

describe('a teacher on the office\'s quest (owner, 2026-09-23)', () => {
  beforeEach(() => {
    current = { ...QUEST, editable: false, created_by: 'the-office', xp_threshold: 200 }
  })

  it('reads it, and cannot change it', async () => {
    await open({ classLink: { due_date: null, publish_at: null, student_ids: null } })
    expect(await screen.findByText('Sketch')).toBeInTheDocument()
    expect(screen.queryByLabelText('Quest title')).toBeNull()
    expect(screen.queryByLabelText('Duplicate task 1')).toBeNull()
    expect(screen.getByText(/Only the person who made this quest, or your school office/)).toBeInTheDocument()
  })

  it('still sets the class\'s own dates, through the class route', async () => {
    await open({ classLink: { due_date: null, publish_at: null, student_ids: null } })
    fireEvent.change(await screen.findByLabelText('Due date'), { target: { value: '2026-10-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save class settings' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1', { due_date: expect.stringMatching(/^2026-10-0[23]T/) }))
    expect(api.put).not.toHaveBeenCalled()
  })

  it('may move the XP to finish when the office left it open', async () => {
    await open({ classLink: { due_date: null, publish_at: null, student_ids: null } })
    fireEvent.change(await screen.findByLabelText(/XP required to finish/), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save class settings' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1', { xp_threshold: 150 }))
  })

  it('may not when the office locked it', async () => {
    current = { ...current, teachers_may_change_xp: false }
    await open({ classLink: { due_date: null, publish_at: null, student_ids: null } })
    expect(await screen.findByLabelText(/XP required to finish/)).toBeDisabled()
    expect(screen.getByText('Set by your school office')).toBeInTheDocument()
  })
})

describe('publishing a draft on a class', () => {
  beforeEach(() => {
    current = { ...QUEST, id: 'q-new', title: '', description: '', is_active: false, is_draft: true,
      draft: { context: 'class', target_id: 'c1' }, tasks: [] }
  })

  it('starts the draft on the class, then sends the class\'s dates and audience with Publish', async () => {
    render(<QuestEditor context="class" classId="c1" scheduledEnabled
      students={[{ student_id: 's1', name: 'Ava' }, { student_id: 's2', name: 'Ben' }]}
      onClose={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/quest-editor/drafts', { context: 'class', class_id: 'c1' }))
    fireEvent.change(await screen.findByLabelText('Quest title'), { target: { value: 'Rock cycle' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-02' } })
    const who = screen.getByRole('group', { name: 'Who gets this quest' })
    fireEvent.click(within(who).getByLabelText('Ben'))
    fireEvent.click(screen.getByRole('button', { name: 'Publish to class' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q-new/publish',
      { due_date: expect.stringMatching(/^2026-10-0[23]T/), student_ids: ['s1'] }))
    expect(api.put).toHaveBeenCalledWith('/api/sis/quest-editor/q-new',
      expect.objectContaining({ title: 'Rock cycle' }))
  })
})

describe('closing', () => {
  it('a blank new draft is removed, not left in Drafts', async () => {
    current = { ...QUEST, id: 'q-new', title: '', description: '', is_active: false, is_draft: true, tasks: [] }
    const { onClose } = await open({ questId: null, context: 'library', classId: null })
    await screen.findByLabelText('Quest title')
    fireEvent.click(screen.getAllByRole('button', { name: /^close$/i }).at(-1))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/sis/quest-editor/q-new?if_empty=1'))
    expect(api.put).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('a draft with words in it is saved on close, never lost', async () => {
    current = { ...QUEST, id: 'q-new', title: '', description: '', is_active: false, is_draft: true, tasks: [] }
    await open({ questId: 'q-new', context: 'library', classId: null })
    fireEvent.change(await screen.findByLabelText('Quest title'), { target: { value: 'Half done' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^close$/i }).at(-1))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/sis/quest-editor/q-new',
      expect.objectContaining({ title: 'Half done' })))
  })
})

describe('an Optio library quest', () => {
  it('says to duplicate it, and offers no save', async () => {
    current = { ...QUEST, editable: false, is_library: true }
    await open({ context: 'library', classId: null })
    expect(await screen.findByText(/Duplicate it to make a copy you can change/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
})
