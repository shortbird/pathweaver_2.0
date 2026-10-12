import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FamilyWeeklyGoalsPage, { LOCK_LINE } from './FamilyWeeklyGoalsPage'

/**
 * Ticket 910668d8, David Nilson: "We would like the Adventurers to be able to
 * type in their own goals." A student gets inputs for this week until the
 * Thursday check-in; a parent stays read-only.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn(() => Promise.resolve({ data: { success: true } })) },
}))
vi.mock('../services/api', () => ({ default: api }))

const week = (extra = {}) => ({
  id: 'w1', week_start: '2026-10-12', checked_in_at: null, freedom: null,
  goals: [{ subject: 'Reading', goal: 'Ch 3', completed: null }, { subject: 'Math', goal: '', completed: null }],
  ...extra,
})

const student = (extra = {}) => ({
  student_id: 's1', name: 'Ada Kid', subjects: ['Reading', 'Math'], current_week_start: '2026-10-12',
  year_goals: {}, freedom: null, weeks: [week()], is_self: true, can_edit_goals: true, goals_locked: false,
  ...extra,
})

const serve = (students) => api.get.mockResolvedValue({ data: { success: true, students } })

beforeEach(() => {
  vi.clearAllMocks()
  api.put.mockResolvedValue({ data: { success: true } })
})

describe('FamilyWeeklyGoalsPage', () => {
  it('gives a student inputs for this week and saves only what changed', async () => {
    serve([student()])
    render(<FamilyWeeklyGoalsPage />)
    expect(await screen.findByLabelText('Reading goal')).toHaveValue('Ch 3')
    expect(screen.getByText(new RegExp(LOCK_LINE))).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Math goal'), { target: { value: 'Lesson 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save goals' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put).toHaveBeenCalledWith('/api/sis/weekly-goals/mine/goals', {
      week_start: '2026-10-12', goals: [{ subject: 'Math', goal: 'Lesson 4' }],
    })
  })

  it('a student with no row yet this week still gets the inputs', async () => {
    serve([student({ weeks: [] })])
    render(<FamilyWeeklyGoalsPage />)
    expect(await screen.findByLabelText('Math goal')).toHaveValue('')
  })

  it('after the check-in the week is read-only and says why', async () => {
    serve([student({ can_edit_goals: false, goals_locked: true,
      weeks: [week({ checked_in_at: '2026-10-15T10:00:00Z' })] })])
    render(<FamilyWeeklyGoalsPage />)
    expect(await screen.findByText(LOCK_LINE)).toBeInTheDocument()
    expect(screen.queryByLabelText('Reading goal')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save goals' })).not.toBeInTheDocument()
  })

  it('a parent reads only', async () => {
    serve([student({ is_self: false, can_edit_goals: false })])
    render(<FamilyWeeklyGoalsPage />)
    expect(await screen.findByText('Ch 3')).toBeInTheDocument()
    expect(screen.queryByLabelText('Reading goal')).not.toBeInTheDocument()
    expect(screen.queryByText(LOCK_LINE)).not.toBeInTheDocument()
  })
})
