import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import ClassQuestsManager from './ClassQuestsManager'
import { groupByCurriculum, OTHER_QUESTS } from './classQuests/groupByCurriculum'
import { withConfirm, confirmText, answerConfirm } from '../../tests/confirmTestUtils'

/**
 * Ticket 1a630837 (iCreate org admin, "Independent study" class): give a whole
 * attached curriculum ("Applied Physics") to chosen students, and see the
 * class's quests grouped by curriculum.
 *
 * Ticket 987218e0: a teacher's copy of a quest can replace the original on the
 * class, from the copy's row. "Students who already started the original keep it."
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../hooks/api/useQuestEditor', () => ({
  useRefreshAfterQuestEdit: () => () => {},
  questEditorApi: {},
}))
vi.mock('./questEditor/QuestDraftsList', () => ({ default: () => null }))
vi.mock('./QuestEditor', () => ({ default: () => null }))

const STUDENTS = [
  { student_id: 's1', name: 'Ava Stone' },
  { student_id: 's2', name: 'Ben Hall' },
  { student_id: 's3', name: 'Cy Park' },
]
const PHYSICS = {
  curriculum_id: 'cur-phys', title: 'Applied Physics', missing_count: 2,
  quests: [{ quest_id: 'p1', title: 'Levers' }, { quest_id: 'p2', title: 'Pulleys' }],
}
const HISTORY = {
  curriculum_id: 'cur-hist', title: 'U.S. History 1', missing_count: 0,
  quests: [{ quest_id: 'h1', title: 'Colonies' }],
}
const quest = (id, title, extra = {}) => ({
  quest_id: id, title, template_task_count: 1, editable_tasks: true, due_date: null,
  xp_threshold: 0, can_edit: false, student_ids: null, curriculum_id: null,
  curriculum_title: null, replaces_quest_id: null, ...extra,
})

let onClass
beforeEach(() => {
  vi.clearAllMocks()
  onClass = [
    quest('free', 'Free reading'),
    quest('h1', 'Colonies', { curriculum_id: 'cur-hist', curriculum_title: 'U.S. History 1' }),
    quest('p0', 'Forces', { curriculum_id: 'cur-phys', curriculum_title: 'Applied Physics' }),
  ]
  api.get.mockImplementation((url) => {
    if (url.includes('curriculum-quests')) return Promise.resolve({ data: { curricula: [PHYSICS, HISTORY] } })
    if (url.endsWith('/quests')) return Promise.resolve({ data: { quests: onClass, students: STUDENTS } })
    return Promise.resolve({ data: { quests: [] } })
  })
  api.post.mockResolvedValue({ data: { success: true, added: 2, widened: 0 } })
})

describe('a curriculum for chosen students (1a630837)', () => {
  it('sends the students picked on the card with the curriculum', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await screen.findByText('Applied Physics', { selector: 'p' })
    const whoButtons = screen.getAllByRole('button', { name: 'Who gets it' })
    fireEvent.click(whoButtons[0])
    const picker = screen.getByRole('group', { name: 'Who gets Applied Physics' })
    // Everyone is ticked to start; untick Cy, so Ava and Ben get it.
    fireEvent.click(within(picker).getByLabelText('Cy Park'))
    fireEvent.click(screen.getByRole('button', { name: 'Give 2 quests to 2 students' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/from-curriculum',
      { curriculum_id: 'cur-phys', student_ids: ['s1', 's2'] }))
  })

  it('with nobody picked the whole class gets it, as before', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await screen.findByText('Applied Physics', { selector: 'p' })
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 to this class' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/from-curriculum', { curriculum_id: 'cur-phys' }))
  })

  it('a set already on the class can still go to more students', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await screen.findByText('U.S. History 1', { selector: 'p' })
    // History has nothing missing: no add button until students are picked.
    expect(screen.queryByRole('button', { name: /Give 1 quest/ })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Who gets it' })[1])
    const picker = screen.getByRole('group', { name: 'Who gets U.S. History 1' })
    fireEvent.click(within(picker).getByLabelText('Ava Stone'))
    fireEvent.click(screen.getByRole('button', { name: 'Give 1 quest to 2 students' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/from-curriculum',
      { curriculum_id: 'cur-hist', student_ids: ['s2', 's3'] }))
  })
})

describe('class quests grouped by curriculum (1a630837)', () => {
  it('lists quests under their curriculum, in card order, with the rest under Other quests', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await screen.findByText('Free reading')
    const list = screen.getByText('Free reading').closest('ul')
    const text = Array.from(list.children).map((li) => li.textContent)
    const at = (s) => text.findIndex((t) => t.startsWith(s))
    expect(at('Applied Physics')).toBeLessThan(at('Forces'))
    expect(at('Forces')).toBeLessThan(at('U.S. History 1'))
    expect(at('U.S. History 1')).toBeLessThan(at('Colonies'))
    expect(at(OTHER_QUESTS)).toBeLessThan(at('Free reading'))
    expect(at('Colonies')).toBeLessThan(at(OTHER_QUESTS))
  })

  it('stays a flat list when no quest is on a curriculum', () => {
    const rows = groupByCurriculum([quest('a', 'A'), quest('b', 'B')], [PHYSICS])
    expect(rows.map((r) => r.heading)).toEqual([null, null])
  })

  it('keeps the class order inside a heading', () => {
    const rows = groupByCurriculum([
      quest('a', 'A', { curriculum_id: 'cur-phys', curriculum_title: 'Applied Physics' }),
      quest('x', 'X'),
      quest('b', 'B', { curriculum_id: 'cur-phys', curriculum_title: 'Applied Physics' }),
    ], [PHYSICS])
    expect(rows.map((r) => [r.quest.quest_id, r.heading])).toEqual([
      ['a', 'Applied Physics'], ['b', null], ['x', OTHER_QUESTS]])
  })
})

describe('replace the original with the teacher\'s copy (987218e0)', () => {
  beforeEach(() => {
    onClass = [
      quest('orig', 'Vocab Week 1'),
      quest('copy', 'Vocab Week 1 (copy)', { can_edit: true, replaces_quest_id: 'orig' }),
    ]
    api.post.mockResolvedValue({ data: { success: true, summary: 'Replaced the original on this class.' } })
  })

  it('is offered on the copy\'s menu only, and says who keeps the original', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await screen.findByText('Vocab Week 1 (copy)')
    fireEvent.click(screen.getByRole('button', { name: 'More for Vocab Week 1' }))
    expect(screen.queryByRole('menuitem', { name: 'Replace the original on this class' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More for Vocab Week 1 (copy)' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace the original on this class' }))
    const text = await confirmText()
    expect(text).toMatch('Replace "Vocab Week 1" with "Vocab Week 1 (copy)" on this class?')
    expect(text).toMatch('The original comes off this class only. Other classes keep it.')
    expect(text).toMatch('Students who already started the original keep it.')
    await answerConfirm()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/copy/replace-original', {}))
  })

  it('cancelling replaces nothing', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" orgId="org-1" />))
    await screen.findByText('Vocab Week 1 (copy)')
    fireEvent.click(screen.getByRole('button', { name: 'More for Vocab Week 1 (copy)' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace the original on this class' }))
    await answerConfirm(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.post).not.toHaveBeenCalled()
  })
})
