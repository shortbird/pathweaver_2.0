/**
 * The student progress report on SIS Reports (2026-10-15).
 *
 * It was the organization console's Progress tab (OrgStudentProgress): every
 * student's XP, quests, tasks in a date range and last activity, with summary
 * cards, sorting and a CSV. The endpoint is require_org_admin, so a campus
 * coordinator is not offered it. A student's name opens their overview, and
 * Back comes back to this report rather than to the retired console.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import ReportsPage from './ReportsPage'
import { visibleReports } from './reportsPage/catalog'

const { api, authState } = vi.hoisted(() => ({
  api: { get: vi.fn() },
  authState: { current: null },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState.current }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: { id: 'org-1', feature_flags: {} } }),
  withOrg: (url) => url,
}))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const ADMIN = { id: 'a1', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] }
const COORDINATOR = { id: 'c1', role: 'org_managed', org_role: 'campus_coordinator', org_roles: ['campus_coordinator'] }

const PROGRESS = {
  success: true,
  students: [
    { id: 's1', name: 'Ada Lovelace', email: 'ada@x', total_xp: 900, quests_enrolled: 3,
      quests_completed: 1, tasks_completed_period: 4, tasks_completed_all: 20, last_active: '2026-10-14' },
    { id: 's2', name: 'Ben Bell', email: 'ben@x', total_xp: 300, quests_enrolled: 1,
      quests_completed: 0, tasks_completed_period: 0, tasks_completed_all: 2, last_active: null },
  ],
  summary: { total_students: 2, total_xp: 1200, total_completions_period: 4, avg_xp: 600 },
}

const Where = () => {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}

const mount = (route = '/reports?report=student-progress') => render(
  <MemoryRouter initialEntries={[route]}>
    <Routes>
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/admin/organizations/:orgId/student/:studentId" element={<p>Overview</p>} />
    </Routes>
    <Where />
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  authState.current = { user: ADMIN }
  api.get.mockImplementation((url) => {
    if (url.includes('/students/progress')) return Promise.resolve({ data: PROGRESS })
    if (url.includes('/reports/enrollment')) return Promise.resolve({ data: { report: { total: 2, by_status: {} } } })
    if (url.includes('/reports/registration-questions')) return Promise.resolve({ data: { questions: [] } })
    if (url.includes('/api/sis/classes')) return Promise.resolve({ data: { classes: [] } })
    return Promise.resolve({ data: {} })
  })
})

describe('who is offered it', () => {
  it('org admins, not campus coordinators', () => {
    expect(visibleReports(true, null, true).map((r) => r.key)).toContain('student-progress')
    expect(visibleReports(false, null, false).map((r) => r.key)).not.toContain('student-progress')
  })

  it("is on an org admin's report list, under Overview", async () => {
    mount('/reports')
    expect(await screen.findByRole('button', { name: /Student progress/ })).toBeInTheDocument()
  })

  it("is not on a coordinator's report list", async () => {
    authState.current = { user: COORDINATOR }
    mount('/reports')
    await screen.findByRole('heading', { name: 'Reports' })
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByRole('button', { name: /Student progress/ })).toBeNull()
  })
})

describe('the report', () => {
  it('reads the org progress endpoint and shows the summary and the students', async () => {
    mount()
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Ben Bell')).toBeInTheDocument()
    expect(screen.getByText('Total Students')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument()
    const call = api.get.mock.calls.find(([u]) => u.includes('/students/progress'))
    expect(call[0]).toBe('/api/admin/organizations/org-1/students/progress')
    expect(call[1].params.start_date).toBeTruthy()
  })

  it("a student's name opens their overview with Back set to this report", async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Lovelace' }))
    await screen.findByText('Overview')
    const where = screen.getByTestId('where').textContent
    expect(where.startsWith('/admin/organizations/org-1/student/s1?returnTo=')).toBe(true)
    expect(decodeURIComponent(where.split('returnTo=')[1])).toBe('/reports?report=student-progress')
  })
})
