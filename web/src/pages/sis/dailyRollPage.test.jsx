import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React, { Suspense } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * The daily roll page (ticket 0680d03c, Apogee Cache Valley): "schoolwide
 * daily attendance for teachers. Present / Absent (comment box for reason, no
 * 'Sick') / Picked Up. Present on arrival in the morning, Picked Up when they
 * leave, pickup time recorded automatically. School days Mon-Thu."
 *
 * Every tap saves (coaches take it on their phones at the door), the buttons
 * are the school's statuses, Absent opens a reason box, and Picked up records
 * the time and can be undone. The backend side is
 * backend/tests/test_sis_attendance_daily_roll.py.
 */

const authState = { user: { id: 'coach-1', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
const orgState = { activeOrg: null }
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: orgState.activeOrg }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import DailyRollPage from './DailyRollPage'
import { AttendanceRoute } from '../../sis/SisRoutes'

const TODAY = '2026-10-13'
const SETTINGS = { daily_roll: true, checkout: true, statuses: ['present', 'absent'], school_days: [1, 2, 3, 4] }
const ROSTER = () => [
  { student_user_id: 's1', name: 'Ada Ant', age: 9, status: null, note: null, arrived_at: null, departed_at: null, planned_absence: null },
  { student_user_id: 's2', name: 'Bo Bee', age: 10, status: 'present', note: null,
    arrived_at: '2026-10-13T14:05:00Z', departed_at: null, planned_absence: null },
  { student_user_id: 's3', name: 'Cy Cat', age: 11, status: 'present', note: null,
    arrived_at: '2026-10-13T14:10:00Z', departed_at: '2026-10-13T21:30:00Z', planned_absence: null },
]

const rowOf = (name) => screen.getByText(name).closest('[data-student-row]')

beforeEach(() => {
  vi.clearAllMocks()
  authState.user = { id: 'coach-1', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'] }
  orgState.activeOrg = null
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/attendance/daily')) {
      return Promise.resolve({ data: { roster: ROSTER(), settings: SETTINGS, today: TODAY, date: TODAY } })
    }
    return Promise.resolve({ data: {} })
  })
  api.post.mockImplementation((url, body) => {
    if (url === '/api/sis/attendance/daily') {
      const e = body.entries[0]
      return Promise.resolve({ data: { saved: [{ ...e, arrived_at: e.status === 'present' ? '2026-10-13T15:00:00Z' : null, departed_at: null }] } })
    }
    return Promise.resolve({ data: { record: { departed_at: '2026-10-13T22:00:00Z' } } })
  })
  api.delete.mockResolvedValue({ data: { record: { departed_at: null } } })
})

const renderPage = () => render(<MemoryRouter><DailyRollPage /></MemoryRouter>)

describe('DailyRollPage', () => {
  it('offers only the school\'s statuses, with the labels the reporter asked for', async () => {
    renderPage()
    await screen.findByText('Ada Ant')
    const row = within(rowOf('Ada Ant'))
    expect(row.getByRole('button', { name: 'Present' })).toBeInTheDocument()
    expect(row.getByRole('button', { name: 'Absent' })).toBeInTheDocument()
    expect(row.queryByRole('button', { name: 'Late' })).toBeNull()
    expect(row.queryByRole('button', { name: 'Excused' })).toBeNull()
    expect(screen.queryByText(/sick/i)).toBeNull()
  })

  it('shows the counts: here, absent, picked up, not marked', async () => {
    renderPage()
    await screen.findByText('Ada Ant')
    const counts = screen.getByText('Here').closest('[data-roll-counts]')
    const value = (label) => within(counts).getByText(label).nextSibling.textContent
    expect(value('Here')).toBe('1')
    expect(value('Absent')).toBe('0')
    expect(value('Picked up')).toBe('1')
    expect(value('Not marked')).toBe('1')
  })

  it('saves a tap at once and shows the arrival time', async () => {
    renderPage()
    await screen.findByText('Ada Ant')
    fireEvent.click(within(rowOf('Ada Ant')).getByRole('button', { name: 'Present' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/attendance/daily')
    expect(body).toMatchObject({ date: TODAY, organization_id: 'org-1',
      entries: [{ student_user_id: 's1', status: 'present', note: null }] })
    await waitFor(() => expect(within(rowOf('Ada Ant')).getByText(/^Arrived /)).toBeInTheDocument())
  })

  it('Absent opens a reason box and the reason is saved on the absent mark', async () => {
    renderPage()
    await screen.findByText('Ada Ant')
    fireEvent.click(within(rowOf('Ada Ant')).getByRole('button', { name: 'Absent' }))
    const box = await screen.findByLabelText('Reason Ada Ant is absent')
    fireEvent.change(box, { target: { value: 'Dentist' } })
    fireEvent.click(within(rowOf('Ada Ant')).getByRole('button', { name: 'Save reason' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1].entries).toEqual([{ student_user_id: 's1', status: 'absent', note: 'Dentist' }])
  })

  it('Picked up records the pickup and shows its time, with an undo', async () => {
    renderPage()
    await screen.findByText('Bo Bee')
    fireEvent.click(within(rowOf('Bo Bee')).getByRole('button', { name: 'Picked up' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/attendance/daily/s2/checkout?date=2026-10-13&organization_id=org-1', { date: TODAY }))
    await waitFor(() => expect(within(rowOf('Bo Bee')).getByRole('button', { name: 'Undo' })).toBeInTheDocument())
    expect(within(rowOf('Bo Bee')).getAllByText(/^Picked up \d/).length).toBeGreaterThan(0)

    fireEvent.click(within(rowOf('Bo Bee')).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/attendance/daily/s2/checkout?date=2026-10-13&organization_id=org-1'))
    await waitFor(() => expect(within(rowOf('Bo Bee')).getByRole('button', { name: 'Picked up' })).toBeInTheDocument())
  })

  it('offers no Picked up button when the school turned check-out off', async () => {
    api.get.mockResolvedValue({ data: { roster: ROSTER(), settings: { ...SETTINGS, checkout: false }, today: TODAY } })
    renderPage()
    await screen.findByText('Bo Bee')
    expect(within(rowOf('Bo Bee')).queryByRole('button', { name: 'Picked up' })).toBeNull()
    expect(screen.queryByText('Picked up', { selector: '[data-roll-counts] *' })).toBeNull()
  })

  it('shows a guardian\'s whole-day report on the student', async () => {
    const roster = ROSTER()
    roster[0].planned_absence = { scope: 'day', reason: 'Family trip' }
    api.get.mockResolvedValue({ data: { roster, settings: SETTINGS, today: TODAY } })
    renderPage()
    expect(await screen.findByText('Parent reported out: Family trip')).toBeInTheDocument()
  })
})

describe('/attendance', () => {
  const renderRoute = () => render(
    <MemoryRouter initialEntries={['/attendance']}>
      <Routes>
        <Route path="/attendance" element={<Suspense fallback={null}><AttendanceRoute /></Suspense>} />
        <Route path="/classes" element={<div>class roll tab</div>} />
        <Route path="/" element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  )

  it('stays the class roll tab for a school without the daily roll', () => {
    orgState.activeOrg = { id: 'org-1', feature_flags: { sis_settings: {} } }
    renderRoute()
    expect(screen.getByText('class roll tab')).toBeInTheDocument()
  })

  it('is the daily roll where it is on, with classes hidden', async () => {
    orgState.activeOrg = { id: 'org-1', feature_flags: { sis_enabled: true,
      modules: { classes: false, attendance: true },
      sis_settings: { hidden_modules: ['classes'], attendance: { daily_roll: true } } } }
    renderRoute()
    expect(await screen.findByText('Ada Ant')).toBeInTheDocument()
  })

  it('goes to the dashboard when the attendance module is off', () => {
    orgState.activeOrg = { id: 'org-1', feature_flags: { sis_enabled: true,
      modules: { attendance: false },
      sis_settings: { hidden_modules: ['attendance'], attendance: { daily_roll: true } } } }
    renderRoute()
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })
})
