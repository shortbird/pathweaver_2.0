/**
 * Credit subjects on a quest's tasks, with no quest-level credit switch.
 *
 * Molly (iCreate, 2026-09-28, b7a5fc1e): "I would really like the quests to
 * NOT have the box checked 'this quest counts toward high school credit' as
 * most will not. I keep having to go back in to edit and uncheck that box,
 * cuz you can't specify when you're first setting it up."
 *
 * Owner decision (Tanner): remove the box. Quests do not count toward credit;
 * tasks do, and only when a student presses Request credit. So every task keeps
 * its subject mapping, and nothing on the authoring screen says a quest counts.
 *
 * This file was questDraftCreditSwitch.test.jsx, which tested that switch: it
 * started on or off per creditDefault, turning it off wrote [] on every task,
 * turning it on refilled them, and it explained what off meant. Those tests
 * were removed with the switch they tested -- there is no control left for
 * them to exercise. What they protected that still matters is kept below:
 * training hides the pickers, a chosen subject is never hidden, and a task is
 * never saved with no subject by accident.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import QuestDraftForm, { blankTask, tasksCarryChosenSubjects, withPillarSubject } from './QuestDraftForm'
import QuestEditor from './QuestEditor'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
const { toast } = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => (orgId ? `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}` : url),
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('../../hooks/api/useSisStaff', () => ({ useSisStaff: () => ({ data: [] }) }))

const CREDIT_BOX = /counts toward high school credit/i

const task = (over = {}) => ({
  title: 'Read the handbook', description: '', pillar: 'art', xp_value: 100, is_required: true,
  ...over,
})

const draft = (tasks, props = {}) => render(
  <QuestDraftForm
    title="" setTitle={() => {}}
    description="" setDescription={() => {}}
    tasks={tasks} setTasks={() => {}}
    {...props}
  />
)

describe('the form has no quest-level credit switch (b7a5fc1e)', () => {
  it('shows no "counts toward high school credit" box, and a subject on every task', () => {
    draft([task(), task({ title: 'Visit the makerspace' })])
    expect(screen.queryByLabelText(CREDIT_BOX)).toBeNull()
    expect(screen.queryByText(CREDIT_BOX)).toBeNull()
    expect(screen.getAllByText('Counts toward credit')).toHaveLength(2)
  })

  it('hides the pickers where the caller says so (staff training), tasks still editable', () => {
    draft([task(), task()], { showSubjects: false })
    expect(screen.queryByLabelText(CREDIT_BOX)).toBeNull()
    expect(screen.queryByText('Counts toward credit')).toBeNull()
    expect(screen.getByLabelText('Task 1 XP')).toBeInTheDocument()
  })

  it('shows the pickers anyway when a task already carries a chosen subject', () => {
    // A subject somebody picked must not be saved from behind a hidden control.
    draft([task({ pillar: 'civics', diploma_subjects: ['social_studies', 'language_arts'] })],
      { showSubjects: false })
    expect(screen.getAllByText('Counts toward credit')).toHaveLength(1)
  })
})

describe('tasks keep their subjects', () => {
  it('a new blank task carries its pillar subject and a split', () => {
    const t = blankTask()
    expect(t.diploma_subjects).toEqual(['fine_arts'])
    expect(t.subject_xp_distribution).toEqual({ fine_arts: 100 })
  })

  it('withPillarSubject fills a task saved with no subject, and leaves a chosen one alone', () => {
    const filled = withPillarSubject(task({ pillar: 'stem', diploma_subjects: [], subject_xp_distribution: {} }))
    expect(filled.diploma_subjects).toEqual(['science'])
    expect(filled.subject_xp_distribution).toEqual({ science: 100 })
    const chosen = task({ diploma_subjects: ['social_studies'], subject_xp_distribution: { social_studies: 100 } })
    expect(withPillarSubject(chosen)).toBe(chosen)
  })
})

describe('tasksCarryChosenSubjects', () => {
  it('is false for tasks on their pillar default, or with no subject at all', () => {
    expect(tasksCarryChosenSubjects([task(), task({ diploma_subjects: [] })])).toBe(false)
  })

  it('is true once any task names a subject other than its default, or more than one', () => {
    expect(tasksCarryChosenSubjects([task(), task({ diploma_subjects: ['social_studies'] })])).toBe(true)
    expect(tasksCarryChosenSubjects([task({ diploma_subjects: ['electives', 'language_arts'] })])).toBe(true)
  })
})

// The editor, end to end: create, edit, AI draft, and training.
const qtask = (id, title, extra = {}) => ({
  id, title, description: '', pillar: 'stem', xp_value: 50, is_required: true,
  diploma_subjects: ['science'], subject_xp_distribution: { science: 50 }, ...extra,
})
const QUEST = {
  id: 'q1', title: 'Rocks', description: 'Rocks.', header_image_url: '', is_active: true,
  is_draft: false, draft: null, is_library: false, xp_threshold: 0, teachers_may_change_xp: true,
  allow_custom_tasks: true, editable: true, can_lock_xp: false,
  tasks: [qtask('t1', 'Collect'), qtask('t2', 'Sort')],
}
// Saved while the switch was off: every task written with [].
const NO_CREDIT_TASKS = [
  qtask('t1', 'Collect', { diploma_subjects: [], subject_xp_distribution: {} }),
  qtask('t2', 'Sort', { pillar: 'civics', diploma_subjects: [], subject_xp_distribution: {} }),
]

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
  api.post.mockImplementation(async (url) => {
    if (url.startsWith('/api/sis/quest-editor/drafts')) return { data: { quest_id: current.id } }
    return { data: { success: true } }
  })
  api.patch.mockResolvedValue({ data: { success: true } })
  api.delete.mockResolvedValue({ data: { success: true } })
})

const saveAndGetTasks = async (name = 'Save') => {
  fireEvent.click(screen.getByRole('button', { name }))
  await waitFor(() => expect(api.put).toHaveBeenCalled())
  return api.put.mock.calls.at(-1)[1].tasks
}

describe('QuestEditor, with no credit switch', () => {
  it('creating a quest: no credit box, and the first task already has a subject', async () => {
    current = { ...QUEST, id: 'q-new', title: '', description: '', is_active: false, is_draft: true, tasks: [] }
    render(<QuestEditor context="library" onClose={vi.fn()} onDone={vi.fn()} />)
    fireEvent.change(await screen.findByLabelText('Quest title'), { target: { value: 'Watercolor' } })
    expect(screen.queryByLabelText(CREDIT_BOX)).toBeNull()
    expect(screen.getByText('Counts toward credit')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Task 1 /), { target: { value: 'Mix a palette' } })
    const tasks = await saveAndGetTasks('Save draft')
    expect(tasks[0].diploma_subjects).toEqual(['fine_arts'])
  })

  it('editing a quest: no credit box, and each task\'s subjects are saved as they were', async () => {
    render(<QuestEditor context="class" classId="c1" questId="q1" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByLabelText('Quest title')
    expect(screen.queryByLabelText(CREDIT_BOX)).toBeNull()
    const tasks = await saveAndGetTasks()
    expect(tasks.map((t) => t.diploma_subjects)).toEqual([['science'], ['science']])
  })

  it('a quest saved with the old switch off gets its pillar subjects back on save', async () => {
    // Its pickers already showed the pillar's subject; saving [] underneath
    // them would keep the task earning nothing while the screen said otherwise.
    current = { ...QUEST, tasks: NO_CREDIT_TASKS }
    render(<QuestEditor context="library" questId="q1" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByLabelText('Quest title')
    const tasks = await saveAndGetTasks()
    expect(tasks[0].diploma_subjects).toEqual(['science'])
    expect(tasks[0].subject_xp_distribution).toEqual({ science: 50 })
    expect(tasks[1].diploma_subjects).toEqual(['social_studies'])
  })

  it('an AI draft keeps the subjects it came with, and fills any it did not', async () => {
    current = { ...QUEST, id: 'q-new', title: '', description: '', is_active: false, is_draft: true, tasks: [] }
    render(<QuestEditor context="library" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByLabelText('Quest title')
    api.post.mockImplementation(async (url) => {
      if (url === '/api/sis/quest-drafts/generate') {
        return { data: { quest: { title: 'Civics', description: 'Vote.', tasks: [
          { title: 'Read the charter', pillar: 'civics', xp_value: 100,
            diploma_subjects: ['social_studies', 'language_arts'],
            subject_xp_distribution: { social_studies: 50, language_arts: 50 } },
          { title: 'Build a ballot box', pillar: 'stem', xp_value: 100, diploma_subjects: [] },
        ] } } }
      }
      return { data: { success: true } }
    })
    fireEvent.change(screen.getByLabelText('Source material'), { target: { value: 'A civics unit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }))
    await screen.findByDisplayValue('Read the charter')
    expect(screen.queryByLabelText(CREDIT_BOX)).toBeNull()
    const tasks = await saveAndGetTasks('Save draft')
    expect(tasks[0].diploma_subjects).toEqual(['social_studies', 'language_arts'])
    expect(tasks[1].diploma_subjects).toEqual(['science'])
  })

  it('training is unchanged: pickers hidden, and its tasks saved exactly as they were', async () => {
    current = { ...QUEST, tasks: NO_CREDIT_TASKS }
    render(<QuestEditor context="training" questId="q1" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByLabelText('Quest title')
    expect(screen.queryByLabelText(CREDIT_BOX)).toBeNull()
    expect(screen.queryByText('Counts toward credit')).toBeNull()
    const tasks = await saveAndGetTasks()
    expect(tasks.map((t) => t.diploma_subjects)).toEqual([[], []])
  })
})
