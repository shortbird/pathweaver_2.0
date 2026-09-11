import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Taking a quest off one student's list, from the place the teacher is already
 * looking at that student (Gryffin, 2026-09-10: "go into a specific student's
 * assignments and remove them for a specific student").
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import StudentProgressTab from './StudentProgressTab'
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

const render = (ui) => rtlRender(<MemoryRouter>{withConfirm(ui)}</MemoryRouter>)

const QUESTS = [
  { quest_id: 'q1', title: 'Rock Cycle', due_date: null, student_ids: null },
  { quest_id: 'q2', title: 'Glossary', due_date: null, student_ids: ['other'] },
]
const SAM = {
  student_id: 'sam', name: 'Sam Bird', tasks_done: 0, tasks_total: 2,
  quests_started: 1, quests_completed: 0,
  cells: [
    { quest_id: 'q1', assigned: true, started: true, completed: false, done: 0, total: 2 },
    { quest_id: 'q2', assigned: false, started: false, completed: false, done: 0, total: 0 },
  ],
}
const WORK = [
  { quest_id: 'q1', title: 'Rock Cycle', due_date: null, assigned: true, started: true, completed: false,
    tasks: [{ id: 't1', title: 'Draw the cycle', done: false }] },
  { quest_id: 'q2', title: 'Glossary', due_date: null, assigned: false, started: false, completed: false, tasks: [] },
]

const mockServer = () => api.get.mockImplementation((url) => (
  url.endsWith('/progress') && url.includes('/students/')
    ? Promise.resolve({ data: { quests: WORK } })
    : Promise.resolve({ data: { quests: QUESTS, students: [SAM] } })
))

beforeEach(() => {
  vi.clearAllMocks()
  api.delete.mockResolvedValue({ data: { success: true, summary: 'Removed for 1 student.' } })
  api.post.mockResolvedValue({ data: { success: true, summary: 'Added for 1 student.' } })
})

describe('a quest kept to other students', () => {
  it('shows as not assigned in the grid, not as work left undone', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    expect(await screen.findByText('Not assigned')).toBeInTheDocument()
    // Sam has one assigned quest and started it: nobody "hasn't started anything".
    expect(screen.queryByText(/started anything yet/)).not.toBeInTheDocument()
  })

  it('can be given to this student from their panel', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sam Bird' }))
    expect(await screen.findByText('Not assigned to Sam')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Assign to Sam' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q2/students/sam', {}))
  })
})

describe('taking a quest off one student', () => {
  it('asks first, says their work stays, then removes it for that student only', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sam Bird' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove for Sam' }))

    const text = await confirmText()
    expect(text).toMatch(/Rock Cycle/)
    expect(text).toMatch(/rest of the class/)
    expect(text).toMatch(/work stays/)
    await answerConfirm()

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/classes/c1/quests/q1/students/sam'))
  })

  it('does nothing when the teacher cancels', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sam Bird' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove for Sam' }))
    await confirmText()
    await answerConfirm(false)
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('counts only assigned quests as outstanding', async () => {
    mockServer()
    render(<StudentProgressTab classId="c1" className="Earth Science" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sam Bird' }))
    expect(await screen.findByText('1 quest outstanding')).toBeInTheDocument()
  })
})
