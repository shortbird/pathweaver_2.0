import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The campus coordinator's dashboard (iCreate requirements, 2026-08-09):
 * today's campus schedule, the student accountability board with a resolution
 * flow, the coordinator's own schedule, assigned tasks, and quick links.
 */

let authState = {
  user: { id: 'cc-1', role: 'org_managed', org_roles: ['campus_coordinator'], first_name: 'Kate' },
}
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, loading: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (p) => p,
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

import SisDashboard from './SisDashboard'

const DASHBOARD = {
  organization: { id: 'org-1', name: 'iCreate' },
  date: '2026-08-10',
  today_schedule: [
    { class_id: 'c1', class_name: 'Art Studio', start_time: '09:00', end_time: '10:00',
      location: 'Room 4', teacher_name: 'Ms. Rivera', enrolled_count: 12 },
  ],
  attendance: {
    recorded: { present: 30, absent: 2, late: 1, excused: 1 },
    total_recorded: 34,
    reported_out: 1,
    open_alert_count: 1,
    open_alerts: [
      { id: 'a1', student_user_id: 's1', student_name: 'Jane Bowman',
        class_id: 'c1', class_name: 'Art Studio', date: '2026-08-10', status: 'open' },
    ],
    resolutions: ['elsewhere_on_campus', 'late', 'absent_no_notice', 'mismarked', 'other'],
  },
  my_schedule: {
    today: [{ id: 'd1', title: 'Morning arrival duty', start_time: '08:00', end_time: '08:30', assignment_type: 'duty' }],
    upcoming: [],
  },
  my_tasks: [
    { id: 'f1', title: 'Check broken printer', status: 'in_progress', priority: 'high',
      due_date: '2026-08-12', form_type_label: 'Task' },
  ],
  quick_links: [{ label: 'Opening Checklist', url: '/resources' }],
  staff_resources: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/coordinator/dashboard')) {
      return Promise.resolve({ data: { success: true, ...DASHBOARD } })
    }
    return Promise.resolve({ data: {} })
  })
})

const renderPage = () => render(<MemoryRouter><SisDashboard /></MemoryRouter>)

describe('coordinator dashboard', () => {
  it('renders the operational view for a campus coordinator', async () => {
    renderPage()
    // Today's campus schedule (the class name also appears on the alert row)
    expect((await screen.findAllByText('Art Studio')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Ms\. Rivera/)).toBeInTheDocument()
    // My own schedule
    expect(screen.getByText('Morning arrival duty')).toBeInTheDocument()
    // My tasks
    expect(screen.getByText('Check broken printer')).toBeInTheDocument()
    // Quick links
    expect(screen.getByRole('link', { name: /opening checklist/i })).toBeInTheDocument()
  })

  it('shows the accountability board and resolves an alert', async () => {
    renderPage()
    const alertRow = (await screen.findByText('Jane Bowman')).closest('[data-alert-row]')
    expect(within(alertRow).getByText(/not accounted for/i)).toBeInTheDocument()

    fireEvent.change(within(alertRow).getByLabelText(/outcome/i), { target: { value: 'late' } })
    fireEvent.click(within(alertRow).getByRole('button', { name: /resolve/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/attendance/alerts/a1/resolve')
    expect(body.resolution).toBe('late')
  })

  it('still gives an org admin the school dashboard', async () => {
    authState = { user: { id: 'a1', role: 'org_managed', org_roles: ['org_admin'] } }
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/dashboard')) {
        return Promise.resolve({ data: { data: { organization: { name: 'iCreate' }, total_students: 5, active_last_7_days: 2, households: 3, enrollment_status: {} } } })
      }
      return Promise.resolve({ data: {} })
    })
    renderPage()
    expect(await screen.findByText('School Dashboard')).toBeInTheDocument()
    authState = { user: { id: 'cc-1', role: 'org_managed', org_roles: ['campus_coordinator'], first_name: 'Kate' } }
  })
})
