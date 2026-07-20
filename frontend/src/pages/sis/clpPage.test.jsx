import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const STUDENT_PAYLOAD = {
  success: true,
  student: { student_id: 's1', name: 'Alice Ant' },
  family: { household_id: 'h1', name: 'Ant Family' },
  siblings: [{ student_id: 's2', name: 'Bob Ant' }],
  schedule: [
    { class_id: 'c1', name: 'Art', is_enrolled: true, on_waitlist: false, meetings: [
      { day_of_week: 1, start_time: '09:00', end_time: '10:00' },
    ], primary_instructor: { name: 'Mr T' } },
  ],
  classes: [
    { class_id: 'c1', name: 'Art', is_enrolled: true, on_waitlist: false, capacity: 10,
      enrolled_count: 4, spots_left: 6, is_full: false, waitlist_count: 0,
      meetings: [{ day_of_week: 1, start_time: '09:00', end_time: '10:00' }], primary_instructor: { name: 'Mr T' } },
    { class_id: 'c2', name: 'Band', is_enrolled: false, on_waitlist: false, capacity: 8,
      enrolled_count: 4, spots_left: 4, is_full: false, waitlist_count: 0,
      meetings: [{ day_of_week: 2, start_time: '11:00', end_time: '12:00' }] },
    { class_id: 'c3', name: 'Choir', is_enrolled: false, on_waitlist: false, capacity: 6,
      enrolled_count: 6, spots_left: 0, is_full: true, waitlist_count: 2,
      meetings: [{ day_of_week: 3, start_time: '13:00', end_time: '14:00' }] },
  ],
}

const { api } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/clp/directory')) {
      return { data: { families: [
        { household_id: 'h1', name: 'Ant Family', student_count: 2, students: [
          { student_id: 's1', name: 'Alice Ant', grade_level: '3' },
          { student_id: 's2', name: 'Bob Ant', grade_level: '5' },
        ] },
      ], students: [] } }
    }
    if (url.includes('/api/sis/clp/students/')) return { data: STUDENT_PAYLOAD }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { success: true } })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import ClpPage from './ClpPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

describe('ClpPage', () => {
  it('lists families and loads a student schedule + available classes', async () => {
    render(<ClpPage />)
    expect(await screen.findByText('Customized Learning Plan')).toBeInTheDocument()
    // Directory shows the family and its kids.
    expect(await screen.findByText('Ant Family · 2')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Alice Ant'))

    // Student header + enrolled class in the schedule grid.
    expect(await screen.findByText('Weekly schedule')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/clp/students/s1'))
    // Enrolled class NOT in the available list; unenrolled ones are.
    expect(await screen.findByText('Band')).toBeInTheDocument()
    expect(screen.getByText('Choir')).toBeInTheDocument()
  })

  it('enrolls a student into an available class', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Band')
    // Band has an "Enroll" button (open seats).
    fireEvent.click(screen.getAllByText('Enroll')[0])
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/classes/c2/enrollments',
        expect.objectContaining({ student_user_id: 's1', organization_id: 'org-1' }),
      ),
    )
  })

  it('offers "Join waitlist" for a full class', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Choir')
    fireEvent.click(screen.getByText('Join waitlist'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/classes/c3/waitlist',
        expect.objectContaining({ student_user_id: 's1' }),
      ),
    )
  })

  it('enters presentation mode hiding the student search', async () => {
    render(<ClpPage />)
    fireEvent.click(await screen.findByText('Alice Ant'))
    await screen.findByText('Weekly schedule')
    fireEvent.click(screen.getByText('Presentation mode'))
    expect(await screen.findByText('Exit presentation')).toBeInTheDocument()
    // The directory search is gone in presentation mode.
    expect(screen.queryByPlaceholderText('Search students or families…')).not.toBeInTheDocument()
  })
})
