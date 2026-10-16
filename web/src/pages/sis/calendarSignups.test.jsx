import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Sign-ups by named child, spots, repeating events and the list view on the
 * staff calendar.
 *
 * Apogee NoCo (Summer Hurd), SPARK Friday Excursions, 2026-10-16: two chosen
 * Fridays a month, each with its own sign-up list, the office reading who is
 * coming each week by name, and a cap on seats.
 */

// The event editor reads its RSVPs through hooks/api/useSisEventRsvps, so the
// page needs a QueryClient. A fresh client per render keeps one test's cache
// out of the next one's, and retry:false makes a failed query fail the
// assertion rather than hang for three backoff rounds.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))

// The office writes events; a teacher only reads them (CalendarPage).
const auth = vi.hoisted(() => ({ user: { role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] } }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const iso = (day) => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${day}T09:00:00Z`
}

const SPARK = {
  id: 'e1', title: 'SPARK: Zoo', start_at: iso('09'), end_at: null, all_day: false,
  audience: 'school', location: 'Denver Zoo', categories: ['SPARK'], category: 'SPARK',
  rsvp_enabled: true, rsvp_mode: 'children', rsvp_capacity: 3, series_id: 's1',
  rsvp_fee_cents: null, rsvp_closes_at: null, rsvp_summary: { families: 2, people: 3 },
}
const LATER = { ...SPARK, id: 'e2', title: 'SPARK: Museum', start_at: iso('23'), location: 'Museum',
  rsvp_summary: { families: 1, people: 1 } }

const RSVPS = {
  success: true, families: 2, people: 3, capacity: 3, spots_left: 0,
  rsvps: [
    { id: 'r1', household_name: 'Hurd', attending: true, party_size: 2,
      children: [{ id: 'a', name: 'Ada Hurd' }, { id: 'b', name: 'Ben Hurd' }] },
    { id: 'r2', household_name: 'Lee', attending: true, party_size: 1,
      children: [{ id: 'c', name: 'Cy Lee' }] },
  ],
}

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: { count: 4 } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: { deleted: 3 } })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))

const csv = vi.hoisted(() => ({ rows: null }))
vi.mock('../../utils/csv', () => ({
  toCsv: (header, rows) => { csv.rows = [header, ...rows]; return 'csv' },
  downloadCsv: vi.fn(),
  dateStamp: () => 'today',
}))

import CalendarPage, { nthWeekdayLabel } from './CalendarPage'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/rsvps')) return Promise.resolve({ data: RSVPS })
    if (url.includes('/api/sis/events')) {
      return Promise.resolve({ data: { events: [LATER, SPARK], categories: ['SPARK'] } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('replies by child', () => {
  it('names each child and counts children against the spots', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('SPARK: Zoo'))
    expect(await screen.findByText('Ada Hurd, Ben Hurd')).toBeInTheDocument()
    expect(screen.getByText('Cy Lee')).toBeInTheDocument()
    const summary = screen.getByText(/2 families coming/)
    expect(summary).toHaveTextContent('3 children of 3 spots')
    expect(summary).toHaveTextContent('Full')
  })

  it('puts the children in the CSV', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('SPARK: Zoo'))
    fireEvent.click(await screen.findByText('Download CSV'))
    expect(csv.rows[0]).toEqual(['Family', 'Coming', 'Children', 'Names', 'Note'])
    expect(csv.rows[1]).toEqual(['Hurd', 'Yes', 2, 'Ada Hurd, Ben Hurd', ''])
  })

  it('saves the reply mode and the spots', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('SPARK: Zoo'))
    expect(await screen.findByRole('radio', { name: /Pick which children are coming/ })).toBeChecked()
    fireEvent.change(screen.getByLabelText('Spots available'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][1]).toMatchObject({ rsvp_mode: 'children', rsvp_capacity: 12 })
  })
})

describe('repeating events', () => {
  it('sends the dates the office picked as one series', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByPlaceholderText('e.g., Fall Showcase'), { target: { value: 'SPARK' } })
    fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'dates' } })
    fireEvent.change(screen.getByLabelText('Date 2'), { target: { value: '2026-11-20' } })
    fireEvent.click(screen.getByText('+ Add another date'))
    fireEvent.change(screen.getByLabelText('Date 3'), { target: { value: '2026-12-04' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].repeat).toEqual({ every: 'dates', dates: ['2026-11-20', '2026-12-04'] })
  })

  it('asks when a weekly repeat stops', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByPlaceholderText('e.g., Fall Showcase'), { target: { value: 'Hang Time' } })
    fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: 'weekly' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('How many times'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].repeat).toEqual({ every: 'weekly', until: null, count: 8 })
  })

  it('offers no repeat when editing one date, and deletes this and following', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('SPARK: Zoo'))
    await screen.findByRole('button', { name: 'Save' })
    expect(screen.queryByLabelText('Repeats')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'This and following' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalled())
    expect(api.delete.mock.calls[0][0]).toContain('scope=following')
  })

  it('names the monthly weekday', () => {
    expect(nthWeekdayLabel('2026-10-16')).toBe('3rd Friday')
    expect(nthWeekdayLabel('2026-10-30')).toBe('last Friday')
  })
})

describe('the list view', () => {
  it('lists the month in date order with sign-ups against the spots', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByRole('tab', { name: 'List' }))
    const list = await screen.findByRole('list', { name: 'Events this month' })
    const rows = list.querySelectorAll('li')
    expect(rows[0]).toHaveTextContent('SPARK: Zoo')
    expect(rows[0]).toHaveTextContent('Denver Zoo')
    expect(rows[0]).toHaveTextContent('3 children / 3')
    expect(rows[0]).toHaveTextContent('Full')
    expect(rows[1]).toHaveTextContent('SPARK: Museum')
  })
})
