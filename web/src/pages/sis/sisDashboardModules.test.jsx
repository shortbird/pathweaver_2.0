import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SisDashboard from './SisDashboard'

/**
 * A block switches off its own dashboard sections (docs/MICROSCHOOL_FIRST_PLAN.md
 * part 2).
 *
 * Horizon, 2026-10-07: with billing off the School Dashboard still drew a Money
 * card; with registration off it still had waitlist tiles. The backend leaves
 * these sections out (sis_dashboard_service); the page filters a second time so
 * a stale response cannot bring one back. Each section: shown with its module
 * on, gone with it off.
 */

let orgState = { activeOrg: null }

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'a-1', role: 'org_admin', first_name: 'Ada' } }),
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({
    orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false,
    loading: false, activeOrg: orgState.activeOrg,
  }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('./teacherPreview', () => ({ getPreviewTeacher: () => null, withPreview: (p) => p }))
vi.mock('./TeacherDashboard', () => ({ default: () => <div>Teacher dashboard</div> }))
vi.mock('./CoordinatorDashboard', () => ({ default: () => <div>Coordinator dashboard</div> }))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const ROLL = { id: 's1', class_id: 'c1', taken_by: null, sub_status: 'none' }

// Everything a fully-switched-on school gets back.
const FULL = {
  organization: { id: 'org-1', name: 'Test Academy' },
  snapshot: { total_students: 12, active_last_7_days: 5, households: 7,
              enrollment_status: { enrolled: 10 } },
  attention: { waitlist_waiting: 6, age_exceptions: 2, goals_pending: 4 },
  today: {
    date: '2026-10-07',
    schedule: [{ class_id: 'c1', class_name: 'Pottery', start_time: '09:00', end_time: '10:00',
                 enrolled_count: 8, roll: ROLL }],
    attendance: { recorded: { present: 3 }, reported_out: 0 },
    teachers_to_check: {
      grace_minutes: 15, resolutions: [], flagged: [],
      no_roll: [{ class_id: 'c1', class_name: 'Pottery', start_time: '09:00', end_time: '10:00',
                  teacher_name: 'Mr. Park', minutes_late: 40, enrolled_count: 8 }],
    },
  },
  events: [],
  finance: { invoices: { overdue_count: 1, overdue_cents: 5000, outstanding_cents: 9000 },
             tuition_queue: 0 },
  settings: { hidden_modules: [] },
}

const org = (mods) => ({ id: 'org-1', effective_modules: ['sis', 'classes', 'calendar', ...mods] })

const renderWith = async (activeOrg) => {
  orgState = { activeOrg }
  api.get.mockResolvedValue({ data: { data: FULL } })
  render(<MemoryRouter><SisDashboard /></MemoryRouter>)
  await screen.findByText('School snapshot')
}

beforeEach(() => vi.clearAllMocks())

describe('the dashboard follows the modules', () => {
  it('draws every section with every block on', async () => {
    await renderWith(org(['billing', 'registration', 'attendance', 'goals']))
    expect(screen.getByText('Money')).toBeInTheDocument()
    expect(screen.getByText('Waiting for a place')).toBeInTheDocument()
    expect(screen.getByText('Age exception requests')).toBeInTheDocument()
    expect(screen.getByText('Goals to review')).toBeInTheDocument()
    expect(screen.getByText(/Teachers to check/)).toBeInTheDocument()
    expect(screen.getByText("Today's attendance")).toBeInTheDocument()
    expect(screen.getByText('No roll yet')).toBeInTheDocument()
  })

  it('billing off: no Money card', async () => {
    await renderWith(org(['registration', 'attendance', 'goals']))
    expect(screen.queryByText('Money')).not.toBeInTheDocument()
    expect(screen.queryByText(/Billing figures/)).not.toBeInTheDocument()
  })

  it('registration off: no waitlist or age-exception tiles', async () => {
    await renderWith(org(['billing', 'attendance', 'goals']))
    expect(screen.queryByText('Waiting for a place')).not.toBeInTheDocument()
    expect(screen.queryByText('Age exception requests')).not.toBeInTheDocument()
  })

  it('attendance off: no Teachers to check, no roll, no substitutes, no board', async () => {
    await renderWith(org(['billing', 'registration', 'goals']))
    expect(screen.queryByText(/Teachers to check/)).not.toBeInTheDocument()
    expect(screen.queryByText("Today's attendance")).not.toBeInTheDocument()
    expect(screen.queryByText('No roll yet')).not.toBeInTheDocument()
    // The class itself still shows: classes is on.
    expect(screen.getByText('Pottery')).toBeInTheDocument()
  })

  it('goals off: no goals tile', async () => {
    await renderWith(org(['billing', 'registration', 'attendance']))
    expect(screen.queryByText('Goals to review')).not.toBeInTheDocument()
  })

  it('keeps Families and Enrolled for every school; neither is money', async () => {
    await renderWith(org([]))
    expect(screen.getByText('Families')).toBeInTheDocument()
    expect(screen.getByText('Enrolled')).toBeInTheDocument()
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
  })
})
