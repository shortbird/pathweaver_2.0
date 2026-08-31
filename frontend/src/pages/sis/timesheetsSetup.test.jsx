import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * An empty Timesheets page has to say which kind of empty it is.
 *
 * iCreate, 2026-08-25: "Timesheets would be a nice feature if it worked!" The
 * clock, the approvals and the payroll export all worked; what the page never
 * said was that `uses_time_clock` is off by default on every staff profile, so
 * an org that had never switched it on for anybody read "No time entries in
 * this period." as a broken feature rather than as a setup step.
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'iCreate' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, payload } = vi.hoisted(() => {
  const payload = { current: { timesheets: [], setup: null } }
  return {
    payload,
    api: {
      get: vi.fn(() => Promise.resolve({ data: payload.current })),
      post: vi.fn(() => Promise.resolve({ data: { approved: 0 } })),
      patch: vi.fn(() => Promise.resolve({ data: { success: true } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import TimesheetsPage from './TimesheetsPage'

const setResponse = (data) => { payload.current = data }

const sheet = (over = {}) => ({
  user_id: 'u2', name: 'Molly Christensen', entries: [],
  total_hours: 6, approved_hours: 6, open_entries: 0, ...over,
})

describe('Timesheets setup state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setResponse({ timesheets: [], setup: null })
  })

  it('names the switch when nobody is on the clock', async () => {
    setResponse({ timesheets: [], setup: { staff_total: 11, clock_enabled: 0, missing_rate: [] } })
    render(<TimesheetsPage />)

    expect(await screen.findByText(/Nobody is on the time clock yet/i)).toBeInTheDocument()
    expect(screen.getByText(/None of your 11 active staff members have it on/i)).toBeInTheDocument()
    expect(screen.getByText('Uses time clock')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /People . Staff/i }))
      .toHaveAttribute('href', '/people?tab=staff')
  })

  it('reads as an empty week, not a setup step, once staff are on the clock', async () => {
    setResponse({ timesheets: [], setup: { staff_total: 11, clock_enabled: 3, missing_rate: [] } })
    render(<TimesheetsPage />)

    expect(await screen.findByText(/3 staff members are on the clock/i)).toBeInTheDocument()
    expect(screen.queryByText(/Nobody is on the time clock yet/i)).not.toBeInTheDocument()
  })

  it('warns before payday about hours that will export without a rate', async () => {
    setResponse({
      timesheets: [sheet()],
      setup: { staff_total: 4, clock_enabled: 2, missing_rate: [{ user_id: 'u3', name: 'Marika Connole' }] },
    })
    render(<TimesheetsPage />)

    expect(await screen.findByText('Marika Connole')).toBeInTheDocument()
    expect(screen.getByText(/leaves the rate and amount blank/i)).toBeInTheDocument()
  })

  it('stays quiet when every clocked-in staff member has a rate', async () => {
    setResponse({
      timesheets: [sheet()],
      setup: { staff_total: 4, clock_enabled: 2, missing_rate: [] },
    })
    render(<TimesheetsPage />)

    await waitFor(() => expect(screen.getByText('Molly Christensen')).toBeInTheDocument())
    expect(screen.queryByText(/leaves the rate and amount blank/i)).not.toBeInTheDocument()
  })

  it('falls back to the plain empty line when the backend sends no setup block', async () => {
    render(<TimesheetsPage />)
    expect(await screen.findByText('No time entries in this period.')).toBeInTheDocument()
  })
})
