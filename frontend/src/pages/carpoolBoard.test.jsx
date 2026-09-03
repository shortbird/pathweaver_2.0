import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The carpool board (iCreate, 2026-08-06) — the first family-AUTHORED module
 * of the community hub. Families post ride offers/needs and arrange over
 * IN-APP messaging: "Message {name}" is a link into Messages on that person
 * (2026-08-27, replacing the board's own one-shot composer). No phone number
 * ever reaches the board.
 *
 * Exercised through /carpool, its only page since 2026-08-27 — /school kept a
 * second copy at the very bottom of the feed after the rail already linked
 * here, so the board was rendered twice and read once.
 */

vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: { id: 'org-1', name: 'iCreate', homepage: true }, loading: false }),
  OrganizationContext: { _currentValue: null },
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectiveRole: 'parent' }),
}))
vi.mock('./sis/useSisOrg', () => ({
  useSisOrg: () => ({ orgId: null, setOrgId: vi.fn(), orgs: [], loading: false }),
}))
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../services/api'
import CarpoolPage from './CarpoolPage'

const POST = {
  id: 'c1', type: 'offer', message: 'Two seats from Lehi, Tue & Thu mornings.',
  area: 'Lehi', days: 'Tue & Thu', author_name: 'Dana C.', author_id: 'u-dana',
  created_at: '2026-08-05T10:00:00Z', mine: false,
}

let feedResponse

const mockApi = () => {
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/community/feed')) return Promise.resolve({ data: feedResponse })
    if (url.includes('/api/announcements/archive')) {
      return Promise.resolve({ data: { success: true, announcements: [], total: 0 } })
    }
    return Promise.resolve({ data: { success: true, orgs: [] } })
  })
  api.post.mockResolvedValue({ data: { success: true, conversation_id: 'conv-1' } })
  api.delete.mockResolvedValue({ data: { success: true } })
}

const feedWith = (overrides = {}) => ({
  success: true,
  organization_name: 'iCreate',
  can_post_carpool: true,
  can_moderate: false,
  feed: { announcements: [], lost_found: [], recognition: [], events: [], carpool: [POST] },
  ...overrides,
})

const renderPage = () => render(<MemoryRouter><CarpoolPage /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  feedResponse = feedWith()
  mockApi()
})

describe('the carpool board', () => {
  it('shows posts with type, author and details — and no phone numbers', async () => {
    renderPage()
    expect(await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')).toBeInTheDocument()
    expect(screen.getByText('Offering seats')).toBeInTheDocument()
    expect(screen.getByText('Dana C.')).toBeInTheDocument()
    expect(screen.getByText('Lehi · Tue & Thu')).toBeInTheDocument()
  })

  it('sends you to the author\'s thread in Messages, not a composer on the board', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: 'Message Dana' })
    expect(link.getAttribute('href')).toBe('/messages?user=u-dana')
    // The board no longer writes messages itself.
    expect(screen.queryByLabelText('Message Dana')).not.toBeInTheDocument()
  })

  it('offers no Message link when the feed did not name the author', async () => {
    feedResponse = feedWith({
      feed: { announcements: [], lost_found: [], recognition: [], events: [],
              carpool: [{ ...POST, author_id: null }] },
    })
    renderPage()
    await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')
    expect(screen.queryByRole('link', { name: 'Message Dana' })).not.toBeInTheDocument()
  })

  it('posts an offer through the form', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Post a ride offer or need' }))
    fireEvent.change(screen.getByLabelText('Carpool message'), {
      target: { value: 'We need a ride from Saratoga Springs.' },
    })
    fireEvent.change(screen.getByLabelText('Post type'), { target: { value: 'need' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/sis/community/feed/carpool', {
        type: 'need', message: 'We need a ride from Saratoga Springs.', area: '', days: '',
      })
    })
  })

  it('lets the author remove their own post, but not message themselves', async () => {
    feedResponse = feedWith({
      feed: { announcements: [], lost_found: [], recognition: [], events: [], carpool: [{ ...POST, mine: true }] },
    })
    renderPage()
    await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')
    expect(screen.queryByRole('link', { name: 'Message Dana' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/sis/community/feed/carpool/c1')
    })
  })

  it('gives an admin Remove on posts that are not theirs', async () => {
    feedResponse = feedWith({ can_moderate: true })
    renderPage()
    await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('shows a student the board read-only', async () => {
    feedResponse = feedWith({ can_post_carpool: false })
    renderPage()
    await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')
    expect(screen.queryByRole('button', { name: 'Post a ride offer or need' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Message Dana' })).not.toBeInTheDocument()
  })
})
