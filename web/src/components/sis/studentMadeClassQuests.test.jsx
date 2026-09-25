import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClassQuestsManager from './ClassQuestsManager'
import { gridColumns } from './StudentProgressTab'
import { withConfirm } from '../../tests/confirmTestUtils'

/**
 * A student's own quest, made for the class (Gryffin, 2026-09-25).
 *
 * Katie Bird: "if they create their own quest I won't be able to see it,
 * right?" The quest sits on the class kept to the student who made it
 * (`made_by`). The teacher's pages have to treat it as the student's work:
 * no editor (it cannot load a quest with no school), no audience picker (it
 * would hand one student's quest to the class), and one grid column for all
 * of them rather than one per student.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../hooks/api/useQuestEditor', () => ({
  useRefreshAfterQuestEdit: () => () => {},
  useQuestDrafts: () => ({ data: [] }),
  useDiscardQuestDraft: () => ({ mutateAsync: vi.fn() }),
  questEditorApi: {},
}))
vi.mock('./questEditor/QuestDraftsList', () => ({ default: () => null }))

const STUDENTS = [
  { student_id: 's1', name: 'Tarien Bird' },
  { student_id: 's2', name: 'Todd Huntzinger' },
]
const teacherQuest = {
  quest_id: 'q1', title: 'Rock Cycle', template_task_count: 1, editable_tasks: true,
  student_ids: null, can_edit: true,
}
const studentQuest = {
  quest_id: 'q2', title: 'Minerals in Rocks', template_task_count: 0, editable_tasks: false,
  student_ids: ['s1'], can_edit: false, made_by: 's1', made_by_name: 'Tarien Bird',
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/students/s1/progress')) {
      return Promise.resolve({ data: { quests: [], guardians: [] } })
    }
    if (url.includes('curriculum-quests')) return Promise.resolve({ data: { curricula: [] } })
    return Promise.resolve({ data: { quests: [teacherQuest, studentQuest], students: STUDENTS } })
  })
})

describe('the Quests tab', () => {
  it('names the student and keeps the audience picker off their quest', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    expect(await screen.findByText(/Made by Tarien Bird/)).toBeInTheDocument()
    expect(screen.getByText(/Only Tarien Bird/)).toBeInTheDocument()
    // The teacher's own quest keeps its picker; the student's has none.
    expect(screen.getAllByTitle('Choose which students get this quest')).toHaveLength(1)
  })

  it('opens the student’s work instead of the quest editor', async () => {
    render(withConfirm(<ClassQuestsManager classId="c1" />))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Toggle tasks' }))[1])
    fireEvent.click(screen.getByRole('button', { name: 'See Tarien’s work' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/classes/c1/students/s1/progress'))
    expect(screen.queryByRole('button', { name: /Open quest|Edit quest/ })).not.toBeInTheDocument()
  })
})

describe('the progress grid', () => {
  it('folds every student-made quest into one Own quest column', () => {
    const quests = [
      { quest_id: 'q1', title: 'Rock Cycle' },
      { quest_id: 'q2', title: 'Minerals in Rocks', made_by: 's1' },
      { quest_id: 'q3', title: 'Volcanoes', made_by: 's2' },
    ]
    const cols = gridColumns(quests)
    expect(cols.map((c) => c.title)).toEqual(['Rock Cycle', 'Own quest'])

    const student = {
      student_id: 's1',
      cells: [
        { quest_id: 'q1', assigned: true },
        { quest_id: 'q2', assigned: true },
        { quest_id: 'q3', assigned: false },
      ],
    }
    expect(cols[1].cellsFor(student)).toEqual([{ quest_id: 'q2', assigned: true, title: 'Minerals in Rocks' }])
  })

  it('adds no column when no student has made one', () => {
    expect(gridColumns([{ quest_id: 'q1', title: 'Rock Cycle' }]).map((c) => c.key)).toEqual(['q1'])
  })
})
