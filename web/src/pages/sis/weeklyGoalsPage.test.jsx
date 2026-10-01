import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WeeklyGoalsPage, { mondayOf, weekStatus } from './WeeklyGoalsPage'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Apogee Cache Valley' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, board } = vi.hoisted(() => {
  const board = () => ({ data: {
    success: true,
    week_start: '2026-09-28',
    subjects: ['Reading', 'Math'],
    students: [
      { student_id: 's1', name: 'Ada Kid', year_goals: { Reading: 'Read 20 books' },
        week: null,
        last_week: { goals: [{ subject: 'Reading', goal: 'Ch 1-3', completed: true },
          { subject: 'Math', goal: '', completed: null }], checked_in_at: 'x', freedom: 'earned' } },
      { student_id: 's2', name: 'Ben Kid', year_goals: {},
        week: { goals: [{ subject: 'Reading', goal: 'Ch 4', completed: true },
          { subject: 'Math', goal: 'Lesson 9', completed: false }],
        checked_in_at: '2026-10-01T10:00:00Z', valid_complaints: 0, complaints: 0, freedom: 'not_earned' },
        last_week: null },
    ],
  } })
  return {
    board,
    api: {
      get: vi.fn(() => Promise.resolve(board())),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      put: vi.fn(() => Promise.resolve({ data: { success: true } })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve(board()))
  api.put.mockImplementation(() => Promise.resolve({ data: { success: true } }))
})

describe('mondayOf / weekStatus', () => {
  it('maps any day to its Monday', () => {
    expect(mondayOf(new Date(2026, 9, 1))).toBe('2026-09-28') // Thursday
    expect(mondayOf(new Date(2026, 9, 4))).toBe('2026-09-28') // Sunday
    expect(mondayOf(new Date(2026, 8, 28))).toBe('2026-09-28')
  })

  it('reads the server freedom, and never computes it', () => {
    expect(weekStatus(null)).toBe('not_set')
    expect(weekStatus({ goals: [{ goal: 'x' }] })).toBe('goals_set')
    expect(weekStatus({ goals: [{ goal: 'x' }], checked_in_at: 't', freedom: 'earned' })).toBe('earned')
    expect(weekStatus({ goals: [{ goal: 'x' }], checked_in_at: 't', freedom: null })).toBe('checked_in')
  })
})

describe('WeeklyGoalsPage', () => {
  it('lists each student with where their week stands', async () => {
    render(<WeeklyGoalsPage />)
    expect(await screen.findByText('Ada Kid')).toBeInTheDocument()
    expect(screen.getByText(/No goals set · Last week: freedom/)).toBeInTheDocument()
    expect(screen.getByText('1 of 2 goals done')).toBeInTheDocument()
    expect(screen.getByText('No freedom')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/weekly-goals?week_start='))
  })

  it('copies last week goals and saves them for the week shown', async () => {
    render(<WeeklyGoalsPage />)
    fireEvent.click(await screen.findByText('Ada Kid'))
    expect(screen.getByText('This year: Read 20 books')).toBeInTheDocument()
    fireEvent.click(screen.getByText("Copy last week's goals"))
    expect(screen.getByLabelText('Reading')).toHaveValue('Ch 1-3')
    fireEvent.click(screen.getByText('Save goals'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, body] = api.put.mock.calls[0]
    expect(url).toContain('/api/sis/weekly-goals/students/s1/weeks/2026-09-28')
    expect(body.check_in).toBe(false)
    // The copy brings the goal, not last week's answer.
    expect(body.goals[0]).toEqual({ subject: 'Reading', goal: 'Ch 1-3', completed: null })
  })

  it('the Thursday check-in sends check_in with the ticked goals', async () => {
    render(<WeeklyGoalsPage />)
    fireEvent.click(await screen.findByText('Ben Kid'))
    fireEvent.click(screen.getByLabelText('Math done'))
    fireEvent.click(screen.getByText('Save check-in'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const body = api.put.mock.calls[0][1]
    expect(body.check_in).toBe(true)
    expect(body.goals.map((g) => g.completed)).toEqual([true, true])
  })
})
