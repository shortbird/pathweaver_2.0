import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The School Dashboard — the admin's landing view.
 *
 * The behaviour worth holding onto is what the page REFUSES to draw: a tile for
 * a queue with nothing in it (a wall of zeroes reads as work), a tile for a
 * module the org turned off, and a money card for anyone the backend did not
 * send money to.
 */

let authState = { user: { id: 'a-1', role: 'org_admin', first_name: 'Ada' } }
let orgState = { orgId: 'org-1', activeOrg: { id: 'org-1', feature_flags: {} } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({
    orgId: orgState.orgId, setOrgId: vi.fn(), orgs: [], isSuperadmin: false,
    loading: false, activeOrg: orgState.activeOrg,
  }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./teacherPreview', () => ({ getPreviewTeacher: () => null, withPreview: (p) => p }))
vi.mock('./TeacherDashboard', () => ({ default: () => <div>Teacher dashboard</div> }))
vi.mock('./CoordinatorDashboard', () => ({ default: () => <div>Coordinator dashboard</div> }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import SisDashboard from './SisDashboard'

const payload = (over = {}) => ({
  organization: { id: 'org-1', name: 'Test Academy' },
  snapshot: {
    total_students: 12, active_last_7_days: 5, households: 7,
    enrollment_status: { enrolled: 10, applicant: 2 },
  },
  attention: {},
  today: { date: '2026-08-14' },
  events: [],
  settings: { hidden_modules: [], prior_learning_enabled: false },
  ...over,
})

const renderPage = (data) => {
  api.get.mockResolvedValue({ data: { data: payload(data) } })
  return render(<MemoryRouter><SisDashboard /></MemoryRouter>)
}

beforeEach(() => {
  authState = { user: { id: 'a-1', role: 'org_admin', first_name: 'Ada' } }
  orgState = { orgId: 'org-1', activeOrg: { id: 'org-1', feature_flags: {} } }
  vi.clearAllMocks()
})

describe('the queues', () => {
  it('draws a tile per queue with work in it, and a door to each', async () => {
    renderPage({ attention: { attendance_alerts: 3, waitlist_waiting: 6 } })

    const alerts = await screen.findByText('Not accounted for')
    expect(alerts).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(alerts.closest('a')).toHaveAttribute('href', '/attendance')
    expect(screen.getByText('Waiting for a place').closest('a'))
      .toHaveAttribute('href', '/registration?tab=queues')
  })

  it('says so plainly when nothing is waiting', async () => {
    renderPage({ attention: { attendance_alerts: 0, requests_unassigned: 0 } })
    expect(await screen.findByText(/All caught up/)).toBeInTheDocument()
    expect(screen.queryByText('Not accounted for')).not.toBeInTheDocument()
  })

  it('never renders a tile for a module the org turned off', async () => {
    orgState.activeOrg = {
      id: 'org-1',
      feature_flags: { sis_settings: { hidden_modules: ['attendance'] } },
    }
    // A stale response still carrying the count must not resurrect the tile.
    renderPage({ attention: { attendance_alerts: 3, waitlist_waiting: 6 } })

    expect(await screen.findByText('Waiting for a place')).toBeInTheDocument()
    expect(screen.queryByText('Not accounted for')).not.toBeInTheDocument()
    expect(screen.queryByText('Take attendance')).not.toBeInTheDocument()
  })
})

describe('the money', () => {
  it('shows overdue invoices and the tuition queue when the backend sent them', async () => {
    renderPage({
      finance: {
        invoices: {
          open_count: 4, overdue_count: 2, overdue_cents: 125000,
          outstanding_cents: 260000, max_days_overdue: 31,
        },
        tuition_queue: 3,
      },
    })
    expect(await screen.findByText('Money')).toBeInTheDocument()
    expect(screen.getByText('2 · $1,250.00')).toBeInTheDocument()
    expect(screen.getByText('$2,600.00')).toBeInTheDocument()
    expect(screen.getByText('31 days')).toBeInTheDocument()
    expect(screen.getByText('3 awaiting tuition →')).toBeInTheDocument()
  })

  it('draws no money card at all when the payload carries no finance block', async () => {
    // What a campus coordinator's response looks like. The backend is the gate;
    // the page simply has nothing to draw.
    renderPage({ attention: { waitlist_waiting: 1 } })
    expect(await screen.findByText('Waiting for a place')).toBeInTheDocument()
    expect(screen.queryByText('Money')).not.toBeInTheDocument()
  })
})

describe('today and the snapshot', () => {
  it('lists today\'s classes and the attendance board', async () => {
    renderPage({
      today: {
        date: '2026-08-14',
        schedule: [{ class_id: 'c1', class_name: 'Ceramics', start_time: '09:00',
                     end_time: '10:00', teacher_name: 'Bo', enrolled_count: 8 }],
        attendance: { recorded: { present: 20, absent: 2, late: 1, excused: 1 },
                      reported_out: 3, open_alert_count: 2 },
      },
    })
    expect(await screen.findByText('Ceramics')).toBeInTheDocument()
    expect(screen.getByText(/Bo · 8 students/)).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    // Excused + reported out share one figure.
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('keeps the census, demoted under the queues', async () => {
    renderPage()
    expect(await screen.findByText('Total students')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Families')).toBeInTheDocument()
    expect(screen.queryByText('Enrollment status')).not.toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/dashboard'))
  })

  it('sends a coordinator to their own dashboard instead', async () => {
    authState = { user: { id: 'cc-1', role: 'org_managed', org_roles: ['campus_coordinator'] } }
    render(<MemoryRouter><SisDashboard /></MemoryRouter>)
    expect(await screen.findByText('Coordinator dashboard')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
})
