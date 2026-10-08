/**
 * Projects are simpler to build (docs/MICROSCHOOL_FIRST_PLAN.md, part 4).
 *
 * A five-task quest took about 50 controls. The editor now shows the
 * essentials (title, description, links, and per task: title, instructions,
 * XP, links) and puts the rest behind "More options" toggles: per task, for
 * the quest, and for the class. The AI draft panel is one button on a quest
 * that already has tasks, and is not shown where AI is off for the org.
 *
 * The rule that keeps this honest: nothing saved is hidden silently. A closed
 * toggle names what its fields hold, and the class toggle starts open when a
 * release date or a narrowed audience is set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

import QuestDraftForm, { blankTask, TASK_LINKS_LABEL, taskOptionsSummary } from './QuestDraftForm'
import QuestEditor, { questOptionsSummary } from './QuestEditor'
import ClassSettingsSection, { classOptionsSummary } from './questEditor/ClassSettingsSection'
import { OrganizationContext } from '../../contexts/OrganizationContext'

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

const noop = () => {}
const form = (tasks, props = {}) => render(
  <QuestDraftForm title="T" setTitle={noop} description="D" setDescription={noop}
    tasks={tasks} setTasks={noop} {...props} />
)
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const qtask = (id, title, extra = {}) => ({
  id, title, description: '', pillar: 'art', xp_value: 50, is_required: true,
  diploma_subjects: ['fine_arts'], subject_xp_distribution: { fine_arts: 50 }, ...extra,
})
const QUEST = {
  id: 'q1', title: 'Watercolor', description: 'Paint.', header_image_url: '', is_active: true,
  is_draft: false, draft: null, is_library: false, xp_threshold: 0, teachers_may_change_xp: true,
  allow_custom_tasks: true, editable: true, can_lock_xp: false,
  tasks: [qtask('t1', 'Sketch'), qtask('t2', 'Paint')],
}
const BLANK_DRAFT = { ...QUEST, id: 'q-new', title: '', description: '', is_active: false, is_draft: true, tasks: [] }

let current = QUEST
beforeEach(() => {
  vi.clearAllMocks()
  current = QUEST
  api.get.mockImplementation(async (url) => {
    if (url.includes('/resources')) return { data: { quest: [], by_task: {} } }
    if (url.includes('/tasks')) return { data: { tasks: [] } }
    return { data: { quest: current } }
  })
  api.post.mockImplementation(async (url) => {
    if (url.startsWith('/api/sis/quest-editor/drafts')) return { data: { quest_id: current.id } }
    return { data: { success: true } }
  })
  api.put.mockResolvedValue({ data: { success: true } })
})

const openEditor = async (props = {}, org = undefined) => {
  const ui = <QuestEditor context="library" questId="q1" onClose={vi.fn()} onDone={vi.fn()} {...props} />
  render(org === undefined ? ui
    : <OrganizationContext.Provider value={{ organization: org }}>{ui}</OrganizationContext.Provider>)
  await screen.findByLabelText('Quest title')
}

describe('per task: essentials in view, the rest behind More options', () => {
  it('shows title, instructions, XP and the links panel; hides pillar, Required and credit', async () => {
    form([{ ...blankTask(), id: 'task-1', title: 'Sketch' }], { questId: 'quest-1' })
    expect(screen.getByDisplayValue('Sketch')).toBeInTheDocument()
    expect(screen.getByLabelText('Task 1 instructions')).toBeInTheDocument()
    expect(screen.getByLabelText('Task 1 XP')).toBeInTheDocument()
    expect(await screen.findByText(TASK_LINKS_LABEL)).toBeInTheDocument()

    expect(screen.queryByLabelText('Task 1 pillar')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Required' })).toBeNull()
    expect(screen.queryByText('Counts toward credit')).toBeNull()
  })

  it('opens and closes, and says so to assistive tech', () => {
    form([blankTask()])
    const toggle = screen.getByRole('button', { name: 'More options for task 1' })
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle).toHaveTextContent('More options')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(toggle.getAttribute('aria-controls'))
    expect(panel).not.toBeNull()
    expect(within(panel).getByLabelText('Task 1 pillar')).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: 'Required' })).toBeChecked()
    expect(within(panel).getByText('Counts toward credit')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Task 1 pillar')).toBeNull()
  })

  it('each task has its own toggle', () => {
    form([blankTask(), blankTask()])
    fireEvent.click(screen.getByRole('button', { name: 'More options for task 2' }))
    expect(screen.queryByLabelText('Task 1 pillar')).toBeNull()
    expect(screen.getByLabelText('Task 2 pillar')).toBeInTheDocument()
  })

  it('a saved value behind the toggle is named on its closed line', () => {
    const due = '2026-10-12T23:59:00'
    const saved = {
      ...blankTask(), id: 't1', title: 'Rocks', pillar: 'stem', is_required: false,
      diploma_subjects: ['science'], subject_xp_distribution: { science: 100 },
    }
    form([saved], { taskDue: { dates: { t1: due }, onChange: noop } })
    const toggle = screen.getByRole('button', { name: 'More options for task 1' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const line = screen.getByTestId('more-options-summary')
    expect(line).toHaveTextContent('Optional')
    expect(line).toHaveTextContent(`Due ${shortDate(due)}`)
    expect(line).toHaveTextContent('Counts toward Science')
    expect(line).toHaveTextContent('STEM')
  })

  it('the summary leaves out credit where the picker is hidden (training)', () => {
    const t = { ...blankTask(), title: 'Orientation' }
    expect(taskOptionsSummary(t, { showSubjects: false })).not.toMatch(/Counts toward/)
    expect(taskOptionsSummary(t, { showSubjects: true })).toMatch(/Counts toward/)
    expect(taskOptionsSummary({ ...t, is_required: false })).toMatch(/Optional/)
    expect(taskOptionsSummary(t)).not.toMatch(/Optional/)
  })
})

describe('the quest: finish line and own tasks behind More options', () => {
  it('hides XP to finish, the teacher lock and own tasks until opened', async () => {
    await openEditor()
    expect(screen.queryByLabelText(/XP required to finish/)).toBeNull()
    expect(screen.queryByText('Let them add tasks of their own')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'More options for this quest' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText(/XP required to finish/)).toBeInTheDocument()
    expect(screen.getByText('Let them add tasks of their own')).toBeInTheDocument()
  })

  it('names saved non-default values on the closed line', async () => {
    current = { ...QUEST, xp_threshold: 300, allow_custom_tasks: false }
    await openEditor()
    expect(screen.getByText('300 XP to finish · No tasks of their own')).toBeInTheDocument()
  })

  it('says nothing on the closed line when everything is the default', () => {
    expect(questOptionsSummary({
      xpValue: '', xpLocked: false, lockOffered: true, teachersMay: true, customOffered: true, allowCustom: true,
    })).toBe('')
    expect(questOptionsSummary({
      xpValue: '', xpLocked: false, lockOffered: true, teachersMay: false, customOffered: true, allowCustom: true,
    })).toBe('Teachers may not change the XP')
  })
})

describe('the class: due date in view, release, audience and replace behind More options', () => {
  const students = [{ student_id: 's1', name: 'Ava' }, { student_id: 's2', name: 'Ben' }]
  const section = (value, extra = {}) => render(
    <ClassSettingsSection value={value} onChange={noop} students={students} scheduledEnabled {...extra} />
  )

  it('defaults: due date shown, release date and audience hidden until opened', () => {
    section({ due: '', release: '', studentIds: null })
    expect(screen.getByLabelText('Due date')).toBeInTheDocument()
    expect(screen.queryByLabelText('Release date')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Who gets this quest' })).toBeNull()
    const toggle = screen.getByRole('button', { name: 'More options for this class' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Release date')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Who gets this quest' })).toBeInTheDocument()
  })

  it('starts open when the quest is for chosen students only', () => {
    section({ due: '', release: '', studentIds: ['s1'] })
    expect(screen.getByRole('button', { name: 'More options for this class' }))
      .toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('group', { name: 'Who gets this quest' })).getByLabelText('Ava')).toBeChecked()
  })

  it('starts open when a release date is set', () => {
    section({ due: '', release: '2026-10-20', studentIds: null })
    expect(screen.getByLabelText('Release date')).toHaveValue('2026-10-20')
  })

  it('names a narrowed audience and a release date on the closed line', () => {
    expect(classOptionsSummary({ release: '', studentIds: ['s1'] }, students)).toBe('1 of 2 students')
    expect(classOptionsSummary({ release: '', studentIds: null }, students)).toBe('')
    expect(classOptionsSummary({ release: '2026-10-20', studentIds: null }, students)).toMatch(/^Released /)
  })

  it('holds what the caller passes (Replace the original) behind the same toggle', () => {
    section({ due: '', release: '', studentIds: null }, { children: <span>Replace the original</span> })
    expect(screen.queryByText('Replace the original')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More options for this class' }))
    expect(screen.getByText('Replace the original')).toBeInTheDocument()
  })
})

describe('the AI draft panel', () => {
  it('is one "Draft with AI" button on a quest that already has tasks', async () => {
    await openEditor()
    const button = screen.getByRole('button', { name: /Draft with AI/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Source material')).toBeNull()
    fireEvent.click(button)
    expect(screen.getByLabelText('Source material')).toBeInTheDocument()
  })

  it('is open on a blank new quest', async () => {
    current = BLANK_DRAFT
    await openEditor({ questId: null })
    expect(screen.getByLabelText('Source material')).toBeInTheDocument()
  })

  it('is not shown where the org has AI off', async () => {
    current = BLANK_DRAFT
    await openEditor({ questId: null, orgId: 'org-1' }, { id: 'org-1', effective_modules: ['sis'] })
    expect(screen.queryByLabelText('Source material')).toBeNull()
    expect(screen.queryByRole('button', { name: /Draft with AI/ })).toBeNull()
  })

  it('is shown where the org has AI on', async () => {
    await openEditor({ orgId: 'org-1' }, { id: 'org-1', effective_modules: ['ai', 'sis'] })
    expect(screen.getByRole('button', { name: /Draft with AI/ })).toBeInTheDocument()
  })

  it('is shown when the editor cannot tell (a superadmin in another school)', async () => {
    await openEditor({ orgId: 'org-2' }, { id: 'org-1', effective_modules: ['sis'] })
    expect(screen.getByRole('button', { name: /Draft with AI/ })).toBeInTheDocument()
  })
})

describe('the credit picker stays for every school', () => {
  // A first cut of MICROSCHOOL_FIRST part 2 hid it where credits, transcripts
  // and prior learning were all off. That was iCreate, Gryffin and Horizon,
  // whose tasks nearly all carry chosen subjects; without the picker a new
  // task would quietly count as an elective. It stays, under More options.
  const noSubjects = { ...QUEST, tasks: [qtask('t1', 'Sketch', { diploma_subjects: [], subject_xp_distribution: {} })] }

  it('is offered on a school with the credit modules off', async () => {
    current = noSubjects
    await openEditor({ orgId: 'org-1' }, { id: 'org-1', effective_modules: ['sis'] })
    fireEvent.click(await screen.findByRole('button', { name: /More options for task 1/ }))
    expect(screen.getByText('Counts toward credit')).toBeInTheDocument()
  })
})
