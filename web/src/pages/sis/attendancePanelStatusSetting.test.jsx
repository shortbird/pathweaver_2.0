import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The school's statuses setting (sis_settings.attendance.statuses, ticket
 * 0680d03c) also decides the class roll's buttons. Default all four, which is
 * exactly the roll iCreate, Gryffin and Horizon take today
 * (attendancePageStatuses.test.jsx pins that path with no setting at all).
 */

const authState = { user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
const orgState = { activeOrg: null }
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: orgState.activeOrg }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

import AttendancePanel from './classesPage/AttendancePanel'

const CLASSES = [{ id: 'c1', name: 'Art', primary_instructor_id: 'admin-1', meetings: [], enrolled_count: 3 }]
const ROSTER = [
  { student_user_id: 's1', name: 'Ada', status: null },
  { student_user_id: 's2', name: 'Ben', status: 'late' },
  { student_user_id: 's3', name: 'Cy', status: null, planned_absence: { scope: 'day', reason: 'Trip' } },
]

beforeEach(() => {
  vi.clearAllMocks()
  orgState.activeOrg = { id: 'org-1', feature_flags: { sis_settings: { attendance: { statuses: ['present', 'absent'] } } } }
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/classes/c1/attendance')) return Promise.resolve({ data: { roster: ROSTER } })
    if (url.includes('/api/sis/classes')) return Promise.resolve({ data: { classes: CLASSES } })
    return Promise.resolve({ data: {} })
  })
})

const labels = (name) => [...screen.getByText(name).closest('[data-student-row]').querySelectorAll('button[aria-label]')]
  .map((b) => b.getAttribute('aria-label'))

describe('class roll with the school statuses setting', () => {
  it('offers only Present and Absent, plus a stored Late so it stays visible', async () => {
    render(<MemoryRouter><AttendancePanel /></MemoryRouter>)
    await screen.findByText('Ada')
    expect(labels('Ada')).toEqual(['Present', 'Absent'])
    expect(labels('Ben')).toEqual(['Present', 'Absent', 'Late'])
  })

  it('starts a reported-out student absent when excused is off', async () => {
    render(<MemoryRouter><AttendancePanel /></MemoryRouter>)
    await screen.findByText('Cy')
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const byId = Object.fromEntries(api.post.mock.calls[0][1].entries.map((e) => [e.student_user_id, e.status]))
    expect(byId).toEqual({ s1: 'present', s2: 'late', s3: 'absent' })
  })

  it('a school with no setting gets all four, as before', async () => {
    orgState.activeOrg = { id: 'org-1', feature_flags: {} }
    render(<MemoryRouter><AttendancePanel /></MemoryRouter>)
    await screen.findByText('Ada')
    expect(labels('Ada')).toEqual(['Present', 'Absent', 'Late', 'Excused'])
  })
})
