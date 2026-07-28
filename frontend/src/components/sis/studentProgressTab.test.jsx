import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import StudentProgressTab from './StudentProgressTab'

const QUESTS = [
  { quest_id: 'q1', title: 'Bridge Building', due_date: null },
  { quest_id: 'q2', title: 'Poetry Slam', due_date: '2026-09-01' },
]

const student = (name, cells, done = 0, total = 0) => ({
  student_id: name, name, cells, tasks_done: done, tasks_total: total,
  quests_started: cells.filter((c) => c.started).length,
  quests_completed: cells.filter((c) => c.completed).length,
})

const cell = (quest_id, over = {}) => ({
  quest_id, started: false, completed: false, done: 0, total: 0, ...over,
})

beforeEach(() => { vi.clearAllMocks() })

describe('StudentProgressTab', () => {
  it('reads progress from the class progress endpoint', async () => {
    api.get.mockResolvedValue({ data: { quests: [], students: [] } })
    render(<StudentProgressTab classId="c1" className="Art" />)
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/sis/classes/c1/progress'))
  })

  it('points the teacher at the Quests tab when nothing is assigned', async () => {
    api.get.mockResolvedValue({ data: { quests: [], students: [] } })
    render(<StudentProgressTab classId="c1" className="Art" />)
    expect(await screen.findByText('No quests assigned to this class yet.')).toBeInTheDocument()
    expect(screen.getByText(/Assign one on the Quests tab/)).toBeInTheDocument()
  })

  it('says the roster is empty rather than showing a bare table', async () => {
    api.get.mockResolvedValue({ data: { quests: QUESTS, students: [] } })
    render(<StudentProgressTab classId="c1" className="Art" />)
    expect(await screen.findByText('No students enrolled in this class yet.')).toBeInTheDocument()
  })

  it('shows a column per quest and a row per student', async () => {
    api.get.mockResolvedValue({
      data: {
        quests: QUESTS,
        students: [
          student('Ada Byron', [cell('q1', { started: true, completed: true, done: 3, total: 3 }), cell('q2')], 3, 3),
          student('Blaise Pascal', [cell('q1', { started: true, done: 1, total: 4 }), cell('q2')], 1, 4),
        ],
      },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)

    expect(await screen.findByText('Ada Byron')).toBeInTheDocument()
    expect(screen.getByText('Blaise Pascal')).toBeInTheDocument()
    expect(screen.getByText('Bridge Building')).toBeInTheDocument()
    expect(screen.getByText('Poetry Slam')).toBeInTheDocument()
  })

  it('distinguishes done, part-way, and not started', async () => {
    api.get.mockResolvedValue({
      data: {
        quests: [QUESTS[0]],
        students: [
          student('Ada Byron', [cell('q1', { started: true, completed: true, done: 3, total: 3 })], 3, 3),
          student('Blaise Pascal', [cell('q1', { started: true, done: 1, total: 4 })], 1, 4),
          student('Carl Gauss', [cell('q1')], 0, 0),
        ],
      },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)

    expect(await screen.findByText('Done')).toBeInTheDocument()
    expect(screen.getByText('1/4')).toBeInTheDocument()
    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('calls out students who have started nothing', async () => {
    api.get.mockResolvedValue({
      data: {
        quests: [QUESTS[0]],
        students: [
          student('Ada Byron', [cell('q1', { started: true, done: 1, total: 4 })], 1, 4),
          student('Carl Gauss', [cell('q1')], 0, 0),
        ],
      },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)

    expect(await screen.findByText(/1 student hasn’t started anything yet/)).toBeInTheDocument()
  })

  it('says plainly that nothing needs filling in', async () => {
    api.get.mockResolvedValue({
      data: {
        quests: [QUESTS[0]],
        students: [student('Ada Byron', [cell('q1', { started: true, done: 1, total: 4 })], 1, 4)],
      },
    })
    render(<StudentProgressTab classId="c1" className="Art" />)

    expect(await screen.findByText(/there is nothing to fill in/)).toBeInTheDocument()
  })

  it('surfaces a load failure instead of rendering an empty table', async () => {
    const { toast } = await import('react-hot-toast')
    api.get.mockRejectedValue({ response: { data: { error: 'Class not found' } } })
    render(<StudentProgressTab classId="c1" className="Art" />)

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Class not found'))
  })
})
