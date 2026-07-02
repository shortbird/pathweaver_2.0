import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'advisor' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, state } = vi.hoisted(() => {
  const state = {
    classes: [{ id: 'c1', name: 'Pottery' }],
    roster: [
      { student_user_id: 's1', name: 'Bo', status: null },
      { student_user_id: 's2', name: 'Ada', status: null },
    ],
  }
  const apiData = (url) => {
    if (url.includes('/attendance')) return { data: { roster: state.roster } }
    if (url.includes('/api/sis/classes')) return { data: { classes: state.classes } }
    return { data: {} }
  }
  return {
    state,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { count: 2 } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import AttendancePage from './AttendancePage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'advisor' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  state.classes = [{ id: 'c1', name: 'Pottery' }]
  state.roster = [
    { student_user_id: 's1', name: 'Bo', status: null },
    { student_user_id: 's2', name: 'Ada', status: null },
  ]
  vi.clearAllMocks()
})

describe('AttendancePage', () => {
  it('marks tapped students absent and saves the WHOLE roster (untouched = present)', async () => {
    render(<AttendancePage />)
    const classSelect = await screen.findByRole('combobox')
    fireEvent.change(classSelect, { target: { value: 'c1' } })

    // roster appears, everyone defaults to present
    expect(await screen.findByText('Bo')).toBeInTheDocument()
    expect(screen.getAllByText('Present')).toHaveLength(2)

    // tap Bo absent — save sends both students, Ada untouched as present
    fireEvent.click(screen.getByText('Bo'))
    fireEvent.click(screen.getByText('Save (1 absent)'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/attendance', expect.objectContaining({
        entries: [
          { student_user_id: 's1', status: 'absent' },
          { student_user_id: 's2', status: 'present' },
        ],
      })),
    )
  })

  it('auto-selects a teacher\'s only assigned class and shows the My classes chip', async () => {
    state.classes = [
      { id: 'c1', name: 'Pottery', primary_instructor_id: 'u1', enrolled_count: 2, meetings: [] },
      { id: 'c2', name: 'Robotics', primary_instructor_id: 'other' },
    ]
    render(<AttendancePage />)
    // chip section renders only their class, and the roster loads without any clicks
    expect(await screen.findByText('My classes')).toBeInTheDocument()
    expect(await screen.findByText('Bo')).toBeInTheDocument()
    expect(screen.queryAllByText('Robotics')).toHaveLength(1) // dropdown only, no chip
  })

  it('lets a saved absence be toggled back and re-saved as present', async () => {
    state.roster = [{ student_user_id: 's1', name: 'Bo', status: 'absent' }]
    render(<AttendancePage />)
    const classSelect = await screen.findByRole('combobox')
    fireEvent.change(classSelect, { target: { value: 'c1' } })

    // prior save is reflected
    expect(await screen.findByText('Attendance taken')).toBeInTheDocument()
    expect(screen.getByText('Absent')).toBeInTheDocument()

    // toggle back to present and re-save
    fireEvent.click(screen.getByText('Bo'))
    fireEvent.click(screen.getByText('Save — all present'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/attendance', expect.objectContaining({
        entries: [{ student_user_id: 's1', status: 'present' }],
      })),
    )
  })
})
