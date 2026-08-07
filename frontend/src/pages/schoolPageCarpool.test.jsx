import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The carpool board (iCreate, 2026-08-06) — the first family-AUTHORED module
 * of the community hub. Families post ride offers/needs and arrange over
 * IN-APP messaging: "Message {name}" sends the first DM addressed by POST id,
 * so no author account id and no phone number ever reach the board.
 */

vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: { id: 'org-1', name: 'iCreate' }, loading: false }),
}))
vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import api from '../services/api'
import SchoolPage from './SchoolPage'

const POST = {
  id: 'c1', type: 'offer', message: 'Two seats from Lehi, Tue & Thu mornings.',
  area: 'Lehi', days: 'Tue & Thu', author_name: 'Dana C.',
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

const renderPage = () => render(<MemoryRouter><SchoolPage /></MemoryRouter>)

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

  it('messages the author through the app, addressed by post id', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Message Dana' }))
    fireEvent.change(screen.getByLabelText('Message Dana'), {
      target: { value: 'Is there room for one more on Thursdays?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/sis/community/feed/carpool/c1/message',
        { content: 'Is there room for one more on Thursdays?' },
      )
    })
    // The reply lands in Messages — say so, and point there.
    expect(await screen.findByText(/replies land in/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Messages' }).getAttribute('href')).toBe('/messages')
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
    expect(screen.queryByRole('button', { name: 'Message Dana' })).not.toBeInTheDocument()
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

  it('shows a student the board read-only, and hides an empty board entirely', async () => {
    feedResponse = feedWith({ can_post_carpool: false })
    renderPage()
    await screen.findByText('Two seats from Lehi, Tue & Thu mornings.')
    expect(screen.queryByRole('button', { name: 'Post a ride offer or need' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Message Dana' })).not.toBeInTheDocument()

    feedResponse = feedWith({
      can_post_carpool: false,
      feed: { announcements: [], lost_found: [], recognition: [], events: [], carpool: [] },
    })
  })

  it('hides an empty board from someone who cannot post', async () => {
    feedResponse = feedWith({
      can_post_carpool: false,
      feed: { announcements: [], lost_found: [], recognition: [], events: [], carpool: [] },
    })
    renderPage()
    await screen.findByText('No messages yet.')
    expect(screen.queryByText('Carpool')).not.toBeInTheDocument()
  })
})
