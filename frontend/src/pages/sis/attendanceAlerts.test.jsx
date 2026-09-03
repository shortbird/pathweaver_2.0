import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The student-accountability board on the attendance page (iCreate,
 * 2026-09-01): the same "not accounted for" alerts a campus coordinator sees on
 * their dashboard, resolvable here — and clicking a name answers "were they in
 * their other classes that day?" without opening each roster in turn.
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'cc-1', role: 'org_managed', org_roles: ['campus_coordinator'] } }
const orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const ALERT = {
  id: 'al-1', student_user_id: 's1', student_name: 'Jane Bowman',
  class_id: 'c1', class_name: 'Pottery', date: '2026-08-31', status: 'open',
}

const DAY = {
  student_user_id: 's1', student_name: 'Jane Bowman', date: '2026-08-31',
  classes: [
    { class_id: 'c1', class_name: 'Pottery', start_time: '09:00', end_time: '10:00',
      teacher_name: 'Ms. Rivera', status: 'absent', scheduled: true },
    { class_id: 'c2', class_name: 'Robotics', start_time: '11:00', end_time: '12:00',
      teacher_name: 'Mr. Lee', status: 'present', scheduled: true },
    { class_id: 'c3', class_name: 'Choir', start_time: '13:00', end_time: '14:00',
      status: null, scheduled: true },
  ],
  counts: { present: 1, absent: 1, late: 0, excused: 0 },
  not_taken: 1,
}

const { api, state } = vi.hoisted(() => ({
  state: { alerts: [] },
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import AttendancePage from './AttendancePage'

beforeEach(() => {
  vi.clearAllMocks()
  authState = { user: { id: 'cc-1', role: 'org_managed', org_roles: ['campus_coordinator'] } }
  state.alerts = [ALERT]
  api.post.mockResolvedValue({ data: { success: true } })
  api.get.mockImplementation((url) => {
    // Order matters: every URL below also contains '/attendance'.
    if (url.includes('/attendance/alerts')) {
      return Promise.resolve({ data: {
        alerts: state.alerts,
        resolutions: ['elsewhere_on_campus', 'late', 'absent_no_notice', 'mismarked', 'other'],
      } })
    }
    if (url.includes('/attendance/day')) return Promise.resolve({ data: DAY })
    if (url.includes('/attendance/absences')) return Promise.resolve({ data: { absences: [] } })
    if (url.includes('/api/sis/classes')) {
      return Promise.resolve({ data: { classes: [{ id: 'c1', name: 'Pottery' }] } })
    }
    return Promise.resolve({ data: { roster: [] } })
  })
})

describe('attendance page — students not accounted for', () => {
  it('shows the open alerts and resolves one', async () => {
    render(<AttendancePage />)
    const row = (await screen.findByText('Jane Bowman')).closest('[data-alert-row]')
    expect(within(row).getByText(/not accounted for/i)).toBeInTheDocument()
    expect(screen.getByText(/Students not accounted for \(1\)/)).toBeInTheDocument()

    fireEvent.change(within(row).getByLabelText(/outcome/i), { target: { value: 'mismarked' } })
    fireEvent.click(within(row).getByRole('button', { name: /^resolve$/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/attendance/alerts/al-1/resolve',
      expect.objectContaining({ resolution: 'mismarked', organization_id: 'org-1' }),
    ))
  })

  it("clicking the name shows the student's whole day, including the classes they made", async () => {
    render(<AttendancePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Jane Bowman' }))

    // The headline answer: present or late somewhere else that day.
    expect(await screen.findByText(/present or late in 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Roll was not taken in 1/)).toBeInTheDocument()

    const day = api.get.mock.calls.map(([u]) => u).find((u) => u.includes('/attendance/day'))
    expect(day).toContain('/api/sis/students/s1/attendance/day')
    expect(day).toContain('date=2026-08-31')

    // Every class on the day, with its status — the absent one and the one
    // that proves she was on campus.
    const robotics = screen.getByText('Robotics').closest('[data-day-class]')
    expect(within(robotics).getByText('present')).toBeInTheDocument()
    // "Pottery" is also a class-picker option, so pick the day row, not the first match.
    const pottery = screen.getAllByText('Pottery')
      .map((el) => el.closest('[data-day-class]')).find(Boolean)
    expect(within(pottery).getByText('absent')).toBeInTheDocument()
    // "Roll not taken" is not styled as a status — it is a different fact.
    const choir = screen.getByText('Choir').closest('[data-day-class]')
    expect(within(choir).getByText('Roll not taken')).toBeInTheDocument()
  })

  it('hides the board from a teacher, whose alerts endpoint 403s anyway', async () => {
    authState = { user: { id: 'u1', role: 'advisor' } }
    render(<AttendancePage />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByText(/Students not accounted for/)).not.toBeInTheDocument()
    expect(api.get.mock.calls.some(([u]) => u.includes('/attendance/alerts'))).toBe(false)
  })

  it('renders nothing when no student is unaccounted for', async () => {
    state.alerts = []
    render(<AttendancePage />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByText(/Students not accounted for/)).not.toBeInTheDocument()
  })
})
