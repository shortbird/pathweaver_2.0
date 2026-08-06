import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The school's Community board, on the family side of the app.
 *
 * iCreate, 2026-08-01: "I can't see the shoutouts or lost and found or other
 * things from the non-admin side of things." — and, on what lost & found holds:
 * "just the item that was lost so parents can see it and know to come pick it
 * up."
 *
 * It is the second tab of the school's own page (/school, titled with the
 * school's name), and appears only when the school has actually posted
 * something. Someone who is in no school never reaches this page at all — see
 * schoolPageAccess.test.jsx.
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

const openCommunity = async () => {
  const view = renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Community' }))
  return view
}

beforeEach(() => { vi.clearAllMocks(); mockApi(FEED) })

describe('the school community tab', () => {
  it('is offered once the school has posted something', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: 'Community' })).toBeInTheDocument()
  })

  it('stays hidden for a family whose school posts nothing', async () => {
    mockApi(EMPTY_FEED)
    renderPage()
    await screen.findByText('Fall Newsletter')
    expect(screen.queryByRole('button', { name: 'Community' })).not.toBeInTheDocument()
  })

  it('stays hidden for someone who is not in a school at all', async () => {
    api.get.mockImplementation((url) => (
      url.includes('/api/sis/community/feed')
        ? Promise.reject(new Error('403'))
        : Promise.resolve(archive)
    ))
    renderPage()
    await screen.findByText('Fall Newsletter')
    expect(screen.queryByRole('button', { name: 'Community' })).not.toBeInTheDocument()
  })

  it('shows the noticeboard post, formatting and all', async () => {
    const { container } = await openCommunity()
    expect(await screen.findByText('Early dismissal')).toBeInTheDocument()
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.getByText('Urgent')).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('noon')
  })

  it('shows a lost item by what it is and where to collect it', async () => {
    await openCommunity()
    expect(await screen.findByText('Blue water bottle')).toBeInTheDocument()
    expect(screen.getByText(/Collect it from the office/)).toBeInTheDocument()
    expect(screen.getByText(/found at Gym/)).toBeInTheDocument()
    // The clock is the useful part: unclaimed items get donated.
    expect(screen.getByText('Donated in 10 days')).toBeInTheDocument()
  })

  it('shows shout-outs', async () => {
    await openCommunity()
    expect(await screen.findByText('Van S.')).toBeInTheDocument()
    expect(screen.getByText('Student spotlight')).toBeInTheDocument()
    expect(screen.getByText('Built the whole robot arm himself.')).toBeInTheDocument()
  })

  it('shows what is coming up', async () => {
    await openCommunity()
    expect(await screen.findByText('Open house')).toBeInTheDocument()
    expect(screen.getByText('Main hall')).toBeInTheDocument()
  })

  it('leaves out a section the school has not used', async () => {
    mockApi({ ...FEED, recognition: [] })
    await openCommunity()
    await screen.findByText('Early dismissal')
    expect(screen.queryByText('Shout-outs')).not.toBeInTheDocument()
  })

  it('goes back to the announcements the school sent', async () => {
    await openCommunity()
    await screen.findByText('Early dismissal')
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }))
    expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
    expect(screen.queryByText('Early dismissal')).not.toBeInTheDocument()
  })
})
