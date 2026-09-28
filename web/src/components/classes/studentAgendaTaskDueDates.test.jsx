/**
 * The student's running list of dated work, and where it shows.
 *
 * iCreate, ticket 26c91e25 (Karina): "Is there a way to have a running due
 * date list of homework? And past assignments could move to the bottom, in
 * case kids didn't complete them?" The agenda carries each dated task as its
 * own item ("Chapters 1-5 · Out of the Dust"); what is coming up comes first
 * and Past due sits at the bottom until the work is turned in. It is on every
 * student's classes page, not only Gryffin's; and a dated task carries a due
 * chip in the quest's own task list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'

import StudentAgenda, { groupAgenda, agendaItemTitle } from './StudentAgenda'
import StudentClassesView from './StudentClassesView'
import SortableTaskItem from '../quest/taskWorkspace/SortableTaskItem'

const { classService, api } = vi.hoisted(() => ({
  classService: {
    getStudentAgenda: vi.fn(),
    getMyStudentClasses: vi.fn(),
  },
  api: { get: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/classService', () => ({ default: classService }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'stu-1', organization_id: 'org-1' } }),
}))
vi.mock('../../hooks/useStudentScope', () => ({ useStudentScope: () => ({ studentId: null }) }))
vi.mock('../../hooks/useHidePillars', () => ({ default: () => false }))

const DAY = 86400000
const at = (days) => new Date(Date.now() + days * DAY).toISOString()

const taskItem = (taskId, title, due) => ({
  kind: 'task', task_id: taskId, task_title: title, title, quest_id: 'q1',
  quest_title: 'Out of the Dust', class_id: 'c1', class_name: 'Reading', due_date: due,
})

// One quest, three weekly readings; week one is already past.
const AGENDA = [
  taskItem('t1', 'Chapters 1-5', at(-3)),
  taskItem('t2', 'Chapters 6-10', at(3)),
  taskItem('t3', 'Chapters 11-15', at(10)),
  { kind: 'quest', quest_id: 'q2', title: 'Poetry', quest_title: 'Poetry', class_id: 'c1',
    class_name: 'Reading', due_date: at(30) },
]

beforeEach(() => {
  vi.clearAllMocks()
  classService.getStudentAgenda.mockResolvedValue({ success: true, agenda: AGENDA })
  classService.getMyStudentClasses.mockResolvedValue({ success: true, classes: [] })
})

const renderAgenda = () => render(
  <MemoryRouter><StudentAgenda /></MemoryRouter>
)

describe('the running list (26c91e25)', () => {
  it('lists each dated task of the quest as its own item', async () => {
    renderAgenda()
    expect(await screen.findByText('Chapters 1-5 · Out of the Dust')).toBeInTheDocument()
    expect(screen.getByText('Chapters 6-10 · Out of the Dust')).toBeInTheDocument()
    expect(screen.getByText('Chapters 11-15 · Out of the Dust')).toBeInTheDocument()
    expect(screen.getByText('Poetry')).toBeInTheDocument()
  })

  it('puts upcoming groups first and Past due at the bottom', async () => {
    renderAgenda()
    await screen.findByText('Chapters 1-5 · Out of the Dust')
    const groups = screen.getAllByTestId(/^agenda-group-/).map((g) => g.dataset.testid.replace('agenda-group-', ''))
    expect(groups).toEqual(['This week', 'Next week', 'Later', 'Past due'])
    const pastDue = screen.getByTestId('agenda-group-Past due')
    expect(within(pastDue).getByText('Chapters 1-5 · Out of the Dust')).toBeInTheDocument()
    expect(within(screen.getByTestId('agenda-group-This week'))
      .getByText('Chapters 6-10 · Out of the Dust')).toBeInTheDocument()
  })

  it('groups by date, soonest first inside a group', () => {
    const now = Date.now()
    const out = groupAgenda([
      taskItem('b', 'B', at(5)), taskItem('a', 'A', at(1)), taskItem('old', 'Old', at(-1)),
    ], now)
    expect(out.map((g) => g.label)).toEqual(['This week', 'Past due'])
    expect(out[0].items.map((i) => i.task_id)).toEqual(['a', 'b'])
  })

  it('names a quest item by its quest', () => {
    expect(agendaItemTitle({ kind: 'quest', quest_title: 'Poetry', title: 'Poetry' })).toBe('Poetry')
    expect(agendaItemTitle(taskItem('t', 'Chapters 1-5', at(1)))).toBe('Chapters 1-5 · Out of the Dust')
  })

  it('renders nothing when nothing is dated', async () => {
    classService.getStudentAgenda.mockResolvedValue({ success: true, agenda: [] })
    const { container } = renderAgenda()
    await waitFor(() => expect(classService.getStudentAgenda).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

describe('on the student classes page', () => {
  const renderClasses = (props = {}) => render(
    <MemoryRouter initialEntries={['/org-classes']}>
      <Routes>
        <Route path="/org-classes" element={<StudentClassesView {...props} />} />
      </Routes>
    </MemoryRouter>
  )

  it('is mounted above the classes, for every school', async () => {
    renderClasses()
    expect(await screen.findByTestId('student-agenda')).toBeInTheDocument()
    expect(screen.getByText('Chapters 1-5 · Out of the Dust')).toBeInTheDocument()
  })

  it('can be turned off where the page mounts its own (Gryffin)', async () => {
    renderClasses({ showAgenda: false })
    await screen.findByText('My Classes')
    expect(screen.queryByTestId('student-agenda')).toBeNull()
    expect(classService.getStudentAgenda).not.toHaveBeenCalled()
  })
})

describe('the due chip on a quest\'s task list', () => {
  const renderTask = (task) => render(
    <DndContext>
      <SortableContext items={[task.id]}>
        <SortableTaskItem task={task} isSelected={false} onClick={() => {}} isFirst isLast />
      </SortableContext>
    </DndContext>
  )
  const base = { id: 'u1', title: 'Chapters 1-5', pillar: 'communication', xp_value: 50, is_required: true }

  it('shows the date the class teacher set', () => {
    renderTask({ ...base, due_date: at(10) })
    expect(screen.getByTestId('task-due-chip').textContent).toMatch(/^Due /)
  })

  it('says overdue when it has passed', () => {
    renderTask({ ...base, due_date: at(-5) })
    expect(screen.getByTestId('task-due-chip').textContent).toMatch(/^Overdue/)
  })

  it('shows nothing for an undated task', () => {
    renderTask({ ...base, due_date: null })
    expect(screen.queryByTestId('task-due-chip')).toBeNull()
  })

  it('shows nothing once the task is done', () => {
    renderTask({ ...base, due_date: at(-5), is_completed: true })
    expect(screen.queryByTestId('task-due-chip')).toBeNull()
  })
})
