import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The unified school feed on /school.
 *
 * Board announcements (sis_announcements) and sent messages (the announcements
 * archive) are two backend systems doing one job from a family's point of
 * view. The tabbed layout that kept them apart had a parent reporting the page
 * broken because her posts were "on the wrong tab" (iCreate, 2026-08-06);
 * since 2026-08-23 there is ONE stream — pinned posts first, then everything
 * newest-first, with shout-outs and lost & found folded in as typed items.
 * Events sit in a slim "Coming up" strip under the feed.
 */

vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: { id: 'org-1', name: 'iCreate', homepage: true }, loading: false }),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectiveRole: 'student' }),
}))
vi.mock('../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
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

const ARCHIVE_MESSAGE = {
  id: 'ann-1', title: 'Fall Newsletter', content: 'Welcome back.',
  message: 'Welcome back.', target_audience: 'everyone',
  created_at: '2026-07-01T12:00:00Z',
}

let archiveMessages = [ARCHIVE_MESSAGE]

const mockApi = (feed) => {
  api.get.mockImplementation((url) => (
    url.includes('/api/sis/community/feed')
      ? Promise.resolve({ data: { success: true, feed, organization_name: 'iCreate' } })
      : Promise.resolve({ data: {
        success: true, total: archiveMessages.length, organization_name: 'iCreate',
        limit: 20, offset: 0, announcements: archiveMessages,
      } })
  ))
  api.post.mockResolvedValue({ data: { success: true } })
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/announcements']}><SchoolPage /></MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  archiveMessages = [ARCHIVE_MESSAGE]
  mockApi(FEED)
})

describe('the unified school feed', () => {
  it('shows board posts and sent messages in ONE stream — no tabs', async () => {
    renderPage()
    expect(await screen.findByText('Early dismissal')).toBeInTheDocument()
    expect(await screen.findByText('Fall Newsletter')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('puts pinned board posts first, everything else newest-first', async () => {
    renderPage()
    const pinnedTitle = await screen.findByText('Early dismissal')
    const shout = await screen.findByText('Van S.')
    const message = await screen.findByText('Fall Newsletter')
    // Pinned (Aug 1) leads; the shout-out (Jul 30) predates it anyway; the
    // archive message (Jul 1) is oldest and last.
    // eslint-disable-next-line no-bitwise
    expect(pinnedTitle.compareDocumentPosition(shout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // eslint-disable-next-line no-bitwise
    expect(shout.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows a board post exactly once when its notify-copy is also in the archive', async () => {
    // A board post created with "notify" writes a second row into the
    // announcements archive. Same title, same day = the same words twice;
    // the board copy wins (it carries pinned/urgent).
    archiveMessages = [
      { id: 'ann-dup', title: 'Early dismissal', content: 'Friday at noon',
        message: 'Friday at noon', target_audience: 'everyone',
        created_at: '2026-08-01T15:00:00Z' },
    ]
    mockApi(FEED)
    renderPage()
    expect(await screen.findAllByText('Early dismissal')).toHaveLength(1)
    expect(screen.getByText('Pinned')).toBeInTheDocument()
  })

  it('is simply the messages when the school posts nothing to the board', async () => {
    mockApi(EMPTY_FEED)
    renderPage()
    expect(await screen.findByText('Fall Newsletter')).toBeInTheDocument()
    expect(screen.queryByText(/Noticeboard/)).not.toBeInTheDocument()
  })

  it('still shows the messages when the user has no feed permission', async () => {
    api.get.mockImplementation((url) => (
      url.includes('/api/sis/community/feed')
        ? Promise.reject(new Error('403'))
        : Promise.resolve({ data: {
          success: true, total: 1, organization_name: 'iCreate',
          limit: 20, offset: 0, announcements: [ARCHIVE_MESSAGE],
        } })
    ))
    api.post.mockResolvedValue({ data: { success: true } })
    renderPage()
    expect(await screen.findByText('Fall Newsletter')).toBeInTheDocument()
  })

  it('shows a board post, formatting and all', async () => {
    const { container } = renderPage()
    expect(await screen.findByText('Early dismissal')).toBeInTheDocument()
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.getByText('Urgent')).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('noon')
  })

  it('folds a lost item into the feed — what it is, and to collect it from the office', async () => {
    renderPage()
    expect(await screen.findByText('Blue water bottle')).toBeInTheDocument()
    expect(screen.getByText('Lost & found')).toBeInTheDocument()
    expect(screen.getByText(/found at Gym/)).toBeInTheDocument()
    expect(screen.getByText(/collect it from the office/)).toBeInTheDocument()
    // The clock is the useful part: unclaimed items get donated.
    expect(screen.getByText('Donated in 10 days')).toBeInTheDocument()
  })

  it('folds shout-outs into the feed', async () => {
    renderPage()
    expect(await screen.findByText('Van S.')).toBeInTheDocument()
    expect(screen.getByText('Student spotlight')).toBeInTheDocument()
    expect(screen.getByText('Built the whole robot arm himself.')).toBeInTheDocument()
  })

  it('shows events in the Coming up strip, not in the feed', async () => {
    renderPage()
    expect(await screen.findByText('Coming up')).toBeInTheDocument()
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

  it('leaves out what the school has not used', async () => {
    mockApi({ ...FEED, recognition: [] })
    renderPage()
    await screen.findByText('Early dismissal')
    expect(screen.queryByText('Student spotlight')).not.toBeInTheDocument()
  })
})
