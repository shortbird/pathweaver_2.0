import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StudentWorkPage from './StudentWorkPage'
import StudentsPanel from './classesPage/StudentsPanel'
import GiveQuestModal from '../../components/sis/studentWork/GiveQuestModal'
import { dueLabel } from '../../components/sis/studentWork/StudentQuestCard'

/**
 * A teacher working with one student, outside any class (2026-10-07: "we need
 * a more individual option where school teachers can assign quests to
 * individual students and work with them that way").
 *
 * The Students tab lists everyone and opens one student's page; the page
 * shows every quest in their account with where it came from, assigns one
 * (with a due date), writes a task just for them, and takes back a quest that
 * was given to them by name -- never one that reaches them through a class.
 */

const render = (ui, { path = '/student-work/:studentId', entry = '/student-work/s1' } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes><Route path={path} element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1' }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'teacher-1', role: 'org_managed', org_role: 'advisor' } }),
}))
const { confirm } = vi.hoisted(() => ({ confirm: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => confirm }))
vi.mock('../../components/sis/QuestEditor', () => ({
  default: ({ context, studentId }) => <div>editor:{context}:{studentId}</div>,
}))
vi.mock('../../components/sis/questEditor/QuestDraftsList', () => ({ default: () => null }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

const individualQuest = {
  quest_id: 'q1', title: 'Fractions', classes: [], started: true, completed_at: null, set_aside: false,
  tasks_done: 1, tasks_total: 2, xp_earned: 50,
  individual: { due_date: '2099-10-31T23:59:59+00:00', assigned_by: 'teacher-1', assigned_by_name: 'Sam Teacher' },
  tasks: [
    { id: 't1', title: 'Fold paper', done: true, completion_id: 'c1', removable: false },
    { id: 't2', title: 'Just for Ada', done: false, removable: true, added_by_name: 'Sam Teacher' },
  ],
}
const classQuest = {
  quest_id: 'q2', title: 'Birds', classes: ['Science'], started: true, completed_at: null, set_aside: false,
  tasks_done: 0, tasks_total: 1, xp_earned: 0, individual: null,
  tasks: [{ id: 't3', title: 'Watch a feeder', done: false, removable: false }],
}
const finishedQuest = { ...classQuest, quest_id: 'q3', title: 'Old one', completed_at: '2026-09-01', tasks: [] }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/student-work/students/s1/assignable-quests')) {
      return Promise.resolve({ data: { quests: [
        { id: 'q9', title: 'Poetry', scope: 'mine', has_it: false },
        { id: 'q1', title: 'Fractions', scope: 'school', has_it: true },
      ] } })
    }
    if (url.startsWith('/api/sis/student-work/students/s1')) {
      return Promise.resolve({ data: {
        student: { id: 's1', name: 'Ada Lee' },
        guardians: [{ id: 'p1', name: 'Jo Lee' }],
        quests: [individualQuest, classQuest, finishedQuest],
      } })
    }
    if (url.startsWith('/api/sis/student-work/students')) {
      return Promise.resolve({ data: { students: [
        { id: 's1', name: 'Ada Lee', individual_quests: 2 },
        { id: 's2', name: 'Ben Ortiz', individual_quests: 0 },
      ] } })
    }
    if (url.startsWith('/api/advisor/notes/')) return Promise.resolve({ data: { notes: [] } })
    return Promise.resolve({ data: {} })
  })
})

describe('the Students tab', () => {
  it('lists every student, filters by name, and opens their page', async () => {
    render(<StudentsPanel />, { path: '/classes', entry: '/classes' })
    expect(await screen.findByText('Ada Lee')).toBeInTheDocument()
    expect(screen.getByText(/2 quests just for them/)).toBeInTheDocument()
    expect(screen.getByText('Ada Lee').closest('a')).toHaveAttribute('href', '/student-work/s1')
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'ben' } })
    expect(screen.queryByText('Ada Lee')).not.toBeInTheDocument()
    expect(screen.getByText('Ben Ortiz')).toBeInTheDocument()
  })
})

describe("one student's page", () => {
  it('shows what they are working on and where each quest came from, finished ones tucked away', async () => {
    render(<StudentWorkPage />)
    expect(await screen.findByRole('heading', { name: 'Ada Lee' })).toBeInTheDocument()
    expect(screen.getByText('Assigned by Sam Teacher')).toBeInTheDocument()
    expect(screen.getByText('Class: Science')).toBeInTheDocument()
    expect(screen.getByText('Due Oct 31')).toBeInTheDocument()
    expect(screen.queryByText('Old one')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/Show finished and set aside \(1\)/))
    expect(screen.getByText('Old one')).toBeInTheDocument()
  })

  it('offers to message the student when this teacher gave them a quest, and their parent', async () => {
    render(<StudentWorkPage />)
    expect(await screen.findByText('Message Ada')).toHaveAttribute('href', '/inbox?tab=mine&to=s1')
    expect(screen.getByText('Message Jo Lee')).toHaveAttribute('href', '/inbox?tab=mine&to=p1')
  })

  it('takes back a quest given by name', async () => {
    render(<StudentWorkPage />)
    const card = await screen.findByRole('article', { name: 'Fractions' })
    fireEvent.click(within(card).getByText('Fractions'))
    fireEvent.click(within(card).getByText('Take this quest back'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/student-work/students/s1/quests/q1?organization_id=org-1'))
  })

  it("never offers to take back a quest that reaches them through a class", async () => {
    render(<StudentWorkPage />)
    const card = await screen.findByRole('article', { name: 'Birds' })
    fireEvent.click(within(card).getByText('Birds'))
    expect(within(card).queryByText('Take this quest back')).not.toBeInTheDocument()
    // ...but a teacher can still write them a task on it.
    expect(within(card).getByText('+ Add a task for Ada')).toBeInTheDocument()
  })

  it('writes a task just for them', async () => {
    render(<StudentWorkPage />)
    const card = await screen.findByRole('article', { name: 'Birds' })
    fireEvent.click(within(card).getByText('Birds'))
    fireEvent.click(within(card).getByText('+ Add a task for Ada'))
    fireEvent.change(within(card).getByLabelText('Task title'), { target: { value: 'Sketch a robin' } })
    fireEvent.click(within(card).getByText('Add task'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/student-work/students/s1/quests/q2/tasks?organization_id=org-1',
      { title: 'Sketch a robin', description: '', xp_value: 50 }))
  })

  it('removes only the tasks someone added', async () => {
    render(<StudentWorkPage />)
    const card = await screen.findByRole('article', { name: 'Fractions' })
    fireEvent.click(within(card).getByText('Fractions'))
    const removes = within(card).getAllByText('Remove')
    expect(removes).toHaveLength(1)
    fireEvent.click(removes[0])
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/student-work/students/s1/tasks/t2?organization_id=org-1'))
  })

  it('opens the quest editor for a new quest written for this student', async () => {
    render(<StudentWorkPage />)
    fireEvent.click(await screen.findByText('Write a new quest'))
    expect(screen.getByText('editor:student:s1')).toBeInTheDocument()
  })
})

describe('assigning a quest', () => {
  it('assigns the picked quest with its due date, and will not pick one they already have', async () => {
    const onGiven = vi.fn()
    render(<GiveQuestModal orgId="org-1" student={{ id: 's1', name: 'Ada Lee' }}
      onClose={vi.fn()} onGiven={onGiven} />, { path: '/', entry: '/' })
    expect(await screen.findByText('Poetry')).toBeInTheDocument()
    expect(screen.getByText('Fractions').closest('button')).toBeDisabled()
    fireEvent.click(screen.getByText('Poetry'))
    fireEvent.change(screen.getByLabelText('Due date (optional)'), { target: { value: '2026-10-31' } })
    fireEvent.click(screen.getByText('Assign'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/student-work/students/s1/quests?organization_id=org-1',
      { quest_id: 'q9', due_date: '2026-10-31' }))
    expect(onGiven).toHaveBeenCalled()
  })
})

describe('due labels', () => {
  it('says when a quest is late', () => {
    expect(dueLabel('2000-01-01T00:00:00Z').late).toBe(true)
    expect(dueLabel('2099-01-01T00:00:00Z').late).toBe(false)
    expect(dueLabel(null)).toBeNull()
  })
})
