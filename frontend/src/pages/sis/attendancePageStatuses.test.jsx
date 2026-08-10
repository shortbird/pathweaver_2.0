import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The admin attendance page must be able to write all four statuses.
 *
 * The schema, the summary math, and the daily report have understood
 * present/absent/late/excused since 20260626 — but this page could only write
 * the first two, so a teacher could not mark a student tardy and an admin could
 * not excuse an absence without editing the DB (iCreate requirements review,
 * 2026-08-09). The teacher portal's class page already had the four-chip
 * control; this locks the admin page to the same contract.
 */

const authState = { user: { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

import AttendancePage from './AttendancePage'

const CLASSES = [{ id: 'c1', name: 'Art', primary_instructor_id: 'admin-1', meetings: [], enrolled_count: 2 }]
const ROSTER = [
  { student_user_id: 's1', name: 'Ada', status: null },
  { student_user_id: 's2', name: 'Ben', status: 'excused' },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/classes/c1/attendance')) return Promise.resolve({ data: { roster: ROSTER } })
    if (url.includes('/api/sis/classes')) return Promise.resolve({ data: { classes: CLASSES } })
    return Promise.resolve({ data: {} })
  })
})

describe('admin attendance page — four statuses', () => {
  it('offers all four statuses per student and saves the one tapped', async () => {
    render(<MemoryRouter><AttendancePage /></MemoryRouter>)
    // The single assigned class is auto-selected; roster loads.
    await screen.findByText('Ada')

    // Ada's row offers Present / Absent / Late / Excused.
    const adaRow = screen.getByText('Ada').closest('[data-student-row]')
    for (const label of ['Present', 'Absent', 'Late', 'Excused']) {
      expect(adaRow.querySelector(`[aria-label="${label}"]`)).toBeTruthy()
    }

    fireEvent.click(adaRow.querySelector('[aria-label="Late"]'))
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [, body] = api.post.mock.calls[0]
    const byId = Object.fromEntries(body.entries.map((e) => [e.student_user_id, e.status]))
    expect(byId.s1).toBe('late')
  })

  it('loads and preserves a status someone else already set', async () => {
    render(<MemoryRouter><AttendancePage /></MemoryRouter>)
    await screen.findByText('Ben')

    // Ben came back 'excused' — saving without touching him must keep that,
    // not flatten it to present.
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [, body] = api.post.mock.calls[0]
    const byId = Object.fromEntries(body.entries.map((e) => [e.student_user_id, e.status]))
    expect(byId.s2).toBe('excused')
    expect(byId.s1).toBe('present')
  })
})
