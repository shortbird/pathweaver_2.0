import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClassAttendanceTab from './ClassAttendanceTab'
import classService from '../../services/classService'

vi.mock('../../services/classService', () => ({
  default: {
    getAttendance: vi.fn(),
    markAttendance: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const roster = {
  success: true,
  attendance: {
    meeting_date: '2026-06-30',
    recorded: false,
    students: [
      { student_id: 's1', student: { id: 's1', display_name: 'Ada Lovelace' }, status: null },
      { student_id: 's2', student: { id: 's2', display_name: 'Alan Turing' }, status: null },
    ],
  },
}

describe('ClassAttendanceTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    classService.getAttendance.mockResolvedValue(roster)
    classService.markAttendance.mockResolvedValue({
      success: true,
      summary: { present: 1, absent: 1, excused: 0, parents_notified: 1, org_admins_notified: 0 },
    })
  })

  it('loads the roster and defaults unmarked students to present', async () => {
    render(<ClassAttendanceTab orgId="org-1" classId="cls-1" classData={{}} />)

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Alan Turing')).toBeInTheDocument()
    // Both students default to present
    const presentButtons = screen.getAllByRole('button', { name: 'Present', pressed: true })
    expect(presentButtons).toHaveLength(2)
  })

  it('marks a student absent and saves the full roster with statuses', async () => {
    render(<ClassAttendanceTab orgId="org-1" classId="cls-1" classData={{}} />)
    await screen.findByText('Ada Lovelace')

    // Mark Ada absent (first group's Absent button)
    const absentButtons = screen.getAllByRole('button', { name: 'Absent' })
    fireEvent.click(absentButtons[0])

    fireEvent.click(screen.getByRole('button', { name: /save attendance/i }))

    await waitFor(() => expect(classService.markAttendance).toHaveBeenCalled())
    // Date defaults to today (clock-dependent); assert the records precisely.
    expect(classService.markAttendance).toHaveBeenCalledWith(
      'org-1',
      'cls-1',
      expect.any(String),
      [
        { student_id: 's1', status: 'absent' },
        { student_id: 's2', status: 'present' },
      ]
    )
  })

  it('shows an empty state when no students are enrolled', async () => {
    classService.getAttendance.mockResolvedValue({
      success: true,
      attendance: { meeting_date: '2026-06-30', recorded: false, students: [] },
    })
    render(<ClassAttendanceTab orgId="org-1" classId="cls-1" classData={{}} />)
    expect(await screen.findByText(/no students are enrolled/i)).toBeInTheDocument()
  })
})
