import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Reading the RSVPs an event collected.
 *
 * iCreate, 2026-08-28 (9cf78e9a) asked for RSVPs and payments on calendar
 * events. The collecting shipped without the reading: replies landed in
 * sis_event_rsvps and the office had no screen that showed one. What is worth
 * pinning down is that the headcount is right (a "no" is not a chair) and that
 * a paid event says who has actually paid.
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
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const iso = (day) => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${day}T09:00:00`
}

const SHOWCASE = {
  id: 'e1', title: 'Fall Showcase', start_at: iso('10'), end_at: null, all_day: false,
  audience: 'school', rsvp_enabled: true, rsvp_fee_cents: null, rsvp_closes_at: null,
  rsvp_summary: { families: 2, people: 5 },
}
const CLOSURE = {
  id: 'e2', title: 'No school', start_at: iso('12'), end_at: null, all_day: true,
  audience: 'school', rsvp_enabled: false,
}

const RSVPS = {
  success: true,
  families: 2,
  people: 5,
  rsvps: [
    { id: 'r1', household_name: 'Alvarez', attending: true, party_size: 3, note: 'Bringing grandma' },
    { id: 'r2', household_name: 'Bennett', attending: true, party_size: 2, note: null },
    { id: 'r3', household_name: 'Chen', attending: false, party_size: 1, note: null },
  ],
}

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import CalendarPage from './CalendarPage'

const mockCalendar = (events, rsvps = RSVPS) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/rsvps')) return Promise.resolve({ data: rsvps })
    if (url.includes('/api/sis/events')) {
      return Promise.resolve({ data: { events, categories: [] } })
    }
    return Promise.resolve({ data: {} })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCalendar([SHOWCASE, CLOSURE])
})

describe('RSVPs on a calendar event', () => {
  it('lists who replied, on the event they answered', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('Fall Showcase'))
    expect(await screen.findByText('Alvarez')).toBeInTheDocument()
    expect(screen.getByText('Bennett')).toBeInTheDocument()
    expect(screen.getByText('Bringing grandma')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(
      '/api/sis/events/e1/rsvps?organization_id=org-1')
  })

  it('counts heads, not replies — a "no" is not a chair', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('Fall Showcase'))
    const summary = await screen.findByText(/2 families coming/)
    expect(summary).toHaveTextContent('5 people')
    expect(summary).toHaveTextContent('1 said no')
    expect(screen.getByText('Not coming')).toBeInTheDocument()
  })

  it('shows the headcount on the month grid, so replies are visible without opening anything', async () => {
    render(<CalendarPage />)
    const chip = (await screen.findByText('Fall Showcase')).closest('button')
    expect(chip).toHaveTextContent('5 going')
  })

  it('asks for nothing on an event that never asked for replies', async () => {
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('No school'))
    await screen.findByRole('button', { name: 'Save' })
    expect(screen.queryByText('Replies')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/rsvps'))
  })

  it('says who has paid, and who was never billed, on a paid event', async () => {
    // A charge that fails to raise still keeps the reply — the headcount matters
    // more than the money — so "coming, never billed" must be visible rather
    // than reading as free.
    mockCalendar([{ ...SHOWCASE, rsvp_fee_cents: 1500 }], {
      success: true,
      families: 3,
      people: 3,
      rsvps: [
        { id: 'r1', household_name: 'Alvarez', attending: true, party_size: 1, invoice_id: 'i1', invoice_status: 'paid' },
        { id: 'r2', household_name: 'Bennett', attending: true, party_size: 1, invoice_id: 'i2', invoice_status: 'sent' },
        { id: 'r3', household_name: 'Chen', attending: true, party_size: 1, invoice_id: null, invoice_status: null },
      ],
    })
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('Fall Showcase'))
    expect(await screen.findByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Unpaid')).toBeInTheDocument()
    expect(screen.getByText('Not billed')).toBeInTheDocument()
  })

  it('says so plainly when nobody has replied yet', async () => {
    mockCalendar([SHOWCASE], { success: true, families: 0, people: 0, rsvps: [] })
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('Fall Showcase'))
    expect(await screen.findByText(/Nobody has replied yet/)).toBeInTheDocument()
  })

  it('keeps the replies visible when the RSVP box is unticked', async () => {
    // Unticking the box does not delete the replies that already came in, and
    // an admin who unticks it by accident must still see them.
    render(<CalendarPage />)
    fireEvent.click(await screen.findByText('Fall Showcase'))
    await screen.findByText('Alvarez')
    fireEvent.click(screen.getByRole('checkbox', { name: /Ask families to RSVP/ }))
    await waitFor(() => expect(screen.getByText('Alvarez')).toBeInTheDocument())
  })
})
