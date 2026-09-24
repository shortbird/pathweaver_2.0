import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Who took the roll, on the coordinator dashboard (P7, iCreate 2026-09-23):
 * "Teachers to check" beside the unaccounted students, and "Roll taken by X at
 * 9:04" / "No roll yet" on each Today's schedule row, with the office able to
 * mark a substitute from the row.
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
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: { session: null } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import SisDashboard from './SisDashboard'
import { rollText, substituteText } from '../../components/sis/RollStatus'
import shapeReport from './reportsPage/shapeReport'

const TAKEN = {
  id: 'sess-1', class_id: 'c1', date: '2026-09-22', taken_by: 't1', taken_by_name: 'Ms. Rivera',
  taken_at: '2026-09-22T15:04:00Z', sub_status: 'none', planned: false,
}

const DASHBOARD = {
  organization: { id: 'org-1', name: 'iCreate' },
  date: '2026-09-22',
  today_schedule: [
    { class_id: 'c1', class_name: 'Art Studio', start_time: '09:00', end_time: '10:00',
      teacher_name: 'Ms. Rivera', enrolled_count: 12, roll: TAKEN },
    { class_id: 'c2', class_name: 'Robotics', start_time: '09:00', end_time: '10:00',
      teacher_name: 'Mr. Park', enrolled_count: 9, roll: null },
  ],
  teachers_to_check: {
    grace_minutes: 15,
    no_roll: [{ class_id: 'c2', class_name: 'Robotics', start_time: '09:00', end_time: '10:00',
                teacher_name: 'Mr. Park', minutes_late: 40, enrolled_count: 9 }],
    flagged: [{ id: 'flag-1', class_id: 'c3', class_name: 'Pottery', date: '2026-09-22',
                taken_by: 't9', taken_by_name: 'Mr. Soto', taken_at: '2026-09-22T15:10:00Z',
                substitute_name: 'Mr. Soto', teacher_name: 'Ms. Lee', sub_status: 'flagged' }],
    resolutions: ['confirmed_sub', 'teacher_present', 'other'],
  },
  attendance: { recorded: {}, open_alerts: [], resolutions: [] },
  my_schedule: { today: [], upcoming: [] },
  my_tasks: [],
  quick_links: [],
  staff_resources: [],
  pinned_links: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/coordinator/dashboard')) {
      return Promise.resolve({ data: { success: true, ...DASHBOARD } })
    }
    if (url.includes('/api/sis/staff')) {
      return Promise.resolve({ data: { staff: [{ id: 'sub-1', name: 'Dana Sub' }] } })
    }
    return Promise.resolve({ data: {} })
  })
})

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><SisDashboard /></MemoryRouter>
  </QueryClientProvider>,
)

describe('Teachers to check', () => {
  it('lists classes with no roll and rolls taken by someone else', async () => {
    renderPage()
    const card = await screen.findByText('Teachers to check (2)')
    const section = card.closest('[data-teachers-to-check]')
    expect(within(section).getByText('Robotics')).toBeInTheDocument()
    expect(within(section).getByText(/started 40 min ago/)).toBeInTheDocument()
    expect(within(section).getByText('Pottery')).toBeInTheDocument()
    expect(within(section).getByText(/Roll taken by Mr. Soto/)).toBeInTheDocument()
  })

  it('confirms the substitute with one click', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Substitute: Mr. Soto' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/attendance/sessions/flag-1/resolve',
      expect.objectContaining({ outcome: 'confirmed_sub', organization_id: 'org-1' })))
  })

  it('records that the teacher was present', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Teacher was present' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/attendance/sessions/flag-1/resolve',
      expect.objectContaining({ outcome: 'teacher_present' })))
  })

  it('needs a note for Other', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Other' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('What happened'), { target: { value: 'Co-taught with the aide' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/attendance/sessions/flag-1/resolve',
      expect.objectContaining({ outcome: 'other', note: 'Co-taught with the aide' })))
  })
})

describe("Today's schedule rows", () => {
  it('say who took the roll, or that nobody has', async () => {
    renderPage()
    await screen.findByText('Teachers to check (2)')
    const rows = document.querySelectorAll('[data-roll-status]')
    const texts = [...rows].map((r) => r.textContent)
    expect(texts.some((t) => t.startsWith('Roll taken by Ms. Rivera at'))).toBe(true)
    expect(texts).toContain('No roll yet')
  })

  it('let the office mark a substitute for the day', async () => {
    renderPage()
    await screen.findByText('Teachers to check (2)')
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark substitute' })[1])
    const input = await screen.findByPlaceholderText('Who is covering?')
    fireEvent.focus(input)
    fireEvent.mouseDown(await screen.findByText('Dana Sub'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/sis/classes/c2/substitute', {
      organization_id: 'org-1', date: '2026-09-22', substitute_id: 'sub-1',
    }))
  })
})

describe('roll wording', () => {
  it('reads the same everywhere', () => {
    expect(rollText(null)).toBe('No roll yet')
    expect(rollText({ taken_by: 't1', taken_by_name: 'Ms. R' })).toBe('Roll taken by Ms. R')
    expect(substituteText({ substitute_name: 'Dana', sub_status: 'none', planned: true }))
      .toBe('Substitute planned: Dana')
    expect(substituteText({ substitute_name: 'Dana', sub_status: 'confirmed_sub' })).toBe('Substitute: Dana')
    expect(substituteText({ sub_status: 'none' })).toBe('')
  })

  it('the history report lays out one row per class per day', () => {
    const shaped = shapeReport('roll-call', { report: { from: '2026-09-08', to: '2026-09-22', rows: [
      { date: '2026-09-22', class_name: 'Pottery', teacher_name: 'Ms. Lee', taken_by_name: 'Mr. Soto',
        taken_at_local: '2026-09-22 9:10am', taker_is_teacher: false, substitute_name: 'Mr. Soto',
        status_label: 'To check', sub_status: 'flagged' },
    ] } })
    expect(shaped.title).toBe('Who took roll — 2026-09-08 to 2026-09-22')
    expect(shaped.summary).toBe('1 class day, 1 still to check.')
    expect(shaped.rows[0].slice(0, 8)).toEqual(['2026-09-22', 'Pottery', 'Ms. Lee', 'Mr. Soto',
      '2026-09-22 9:10am', 'No', 'Mr. Soto', 'To check'])
  })
})
