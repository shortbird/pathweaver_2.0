import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The school's Community board, on the family side of the app.
 *
 * iCreate, 2026-08-01: "I can't see the shoutouts or lost and found or other
 * things from the non-admin side of things." — and, on what lost & found holds:
 * "just the item that was lost so parents can see it and know to come pick it
 * up."
 *
 * It lives on the school's own page (/school, titled with the school's name)
 * as ONE feed with the sent-announcements archive — the Announcements/Community
 * toggle was removed 2026-08-06; nothing here is behind a click. Each community
 * section appears only when the school has actually used it. Someone who is in
 * no school never reaches this page at all — see schoolPageAccess.test.jsx.
 */

vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: { id: 'org-1', name: 'iCreate' }, loading: false }),
}))
vi.mock('../services/api', () => ({ default: { get: vi.fn() } }))
import api from '../services/api'
import SchoolPage from './SchoolPage'

const FEED = {
  announcements: [
    { id: 'a1', title: 'Early dismissal', body: '<p>Friday at <strong>noon</strong></p>',
      pinned: true, priority: 'urgent', created_at: '2026-08-01T10:00:00Z' },
  ],
  lost_found: [
    { id: 'l1', description: 'Blue water bottle', image_url: null, category: 'Bottles',
      date_found: '2026-07-28', location_found: 'Gym', created_at: '2026-07-28T10:00:00Z',
      donation_deadline: '2026-08-11', days_until_donation: 10 },
  ],
  recognition: [
    { id: 'r1', type: 'student_spotlight', recipient_name: 'Van S.',
      message: 'Built the whole robot arm himself.', created_at: '2026-07-30T10:00:00Z' },
  ],
  events: [
    { id: 'e1', title: 'Open house', description: 'Come see the studios',
      location: 'Main hall', start_at: '2026-08-10T17:00:00Z', all_day: false },
    // All-day events are stored date-only (00:00 UTC), and a school calendar
    // crosses New Year — both used to render misleadingly (previous local day;
    // no year, so January read as out of order under December).
    { id: 'e2', title: 'Classes resume', description: null,
      location: null, start_at: '2027-01-11T00:00:00Z', all_day: true },
  ],
}

const EMPTY_FEED = { announcements: [], lost_found: [], recognition: [], events: [] }

const archive = {
  data: {
    success: true, total: 1, organization_name: 'iCreate', limit: 20, offset: 0,
    announcements: [{ id: 'ann-1', title: 'Fall Newsletter', content: 'Welcome back.',
                      message: 'Welcome back.', target_audience: 'everyone',
                      created_at: '2026-07-01T12:00:00Z' }],
  },
}

const mockApi = (feed) => {
  api.get.mockImplementation((url) => (
    url.includes('/api/sis/community/feed')
      ? Promise.resolve({ data: { success: true, feed, organization_name: 'iCreate' } })
      : Promise.resolve(archive)
  ))
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/announcements']}><SchoolPage /></MemoryRouter>,
)

beforeEach(() => { vi.clearAllMocks(); mockApi(FEED) })

describe('the school community feed', () => {
  it('is one feed — board and sent announcements together, no toggle', async () => {
    renderPage()
    expect(await screen.findByText('Early dismissal')).toBeInTheDocument()
    expect(await screen.findByText('Fall Newsletter')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Community' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Announcements' })).not.toBeInTheDocument()
  })

  it('is simply the announcements when the school posts nothing to the board', async () => {
    mockApi(EMPTY_FEED)
    renderPage()
    expect(await screen.findByText('Fall Newsletter')).toBeInTheDocument()
    expect(screen.queryByText(/Noticeboard/)).not.toBeInTheDocument()
  })

  it('survives a board the viewer cannot read at all', async () => {
    api.get.mockImplementation((url) => (
      url.includes('/api/sis/community/feed')
        ? Promise.reject(new Error('403'))
        : Promise.resolve(archive)
    ))
    renderPage()
    expect(await screen.findByText('Fall Newsletter')).toBeInTheDocument()
    expect(screen.queryByText(/Noticeboard/)).not.toBeInTheDocument()
  })

  it('shows the noticeboard post, formatting and all', async () => {
    const { container } = renderPage()
    expect(await screen.findByText('Early dismissal')).toBeInTheDocument()
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.getByText('Urgent')).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('noon')
  })

  it('shows a lost item by what it is and where to collect it', async () => {
    renderPage()
    expect(await screen.findByText('Blue water bottle')).toBeInTheDocument()
    expect(screen.getByText(/Collect it from the office/)).toBeInTheDocument()
    expect(screen.getByText(/found at Gym/)).toBeInTheDocument()
    // The clock is the useful part: unclaimed items get donated.
    expect(screen.getByText('Donated in 10 days')).toBeInTheDocument()
  })

  it('shows shout-outs', async () => {
    renderPage()
    expect(await screen.findByText('Van S.')).toBeInTheDocument()
    expect(screen.getByText('Student spotlight')).toBeInTheDocument()
    expect(screen.getByText('Built the whole robot arm himself.')).toBeInTheDocument()
  })

  it('shows upcoming events', async () => {
    renderPage()
    expect(await screen.findByText('Upcoming events')).toBeInTheDocument()
    expect(screen.getByText('Open house')).toBeInTheDocument()
    expect(screen.getByText('Main hall')).toBeInTheDocument()
  })

  it('keeps an all-day event on its own calendar day, year included across New Year', async () => {
    renderPage()
    await screen.findByText('Classes resume')
    // Jan 11 2027 00:00 UTC: local formatting showed "Jan 10" (previous
    // evening) and, with no year, January read as out of order under December.
    expect(screen.getByText(/Jan 11, 2027 · all day/)).toBeInTheDocument()
  })

  it('leaves out a section the school has not used', async () => {
    mockApi({ ...FEED, recognition: [] })
    renderPage()
    await screen.findByText('Early dismissal')
    expect(screen.queryByText('Shout-outs')).not.toBeInTheDocument()
  })

  it('keeps the board above the archive — timely first, paginated last', async () => {
    renderPage()
    const board = await screen.findByText('Early dismissal')
    const sent = await screen.findByText('Fall Newsletter')
    expect(board.compareDocumentPosition(sent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
