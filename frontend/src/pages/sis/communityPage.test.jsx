import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, apiData } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/community/highlights')) {
      return { data: { highlights: {
        announcements: [{ id: 'a1', title: 'Early dismissal', pinned: true, priority: 'urgent',
          body: '<p><strong>Calendar</strong></p><p>Specific info will be added.</p>' }],
        events: [{ id: 'e1', title: 'Field trip', start_at: '2026-08-01T15:00:00Z', all_day: false, location: 'Zoo' }],
        lost_found: [{ id: 'l1', description: 'Blue bottle', location_found: 'Gym' }],
        recognition: [{ id: 'r1', type: 'shout_out', recipient_name: 'Ana', message: 'Great work' }],
        birthdays: [{ user_id: 'b1', name: 'Sam', date: '2026-07-30', days_away: 3 }],
      } } }
    }
    if (url.includes('/api/sis/community/announcements')) {
      return { data: { announcements: [
        { id: 'a1', title: 'Early dismissal', body: 'Friday 1pm', pinned: true, priority: 'urgent', created_at: '2026-07-20T00:00:00Z' },
      ] } }
    }
    if (url.includes('/api/sis/community/lost-found')) {
      return { data: { items: [
        { id: 'l1', description: 'Blue bottle', status: 'unclaimed', date_found: '2026-07-20',
          donation_deadline: '2026-08-03', days_until_donation: 7, past_donation_deadline: false, location_found: 'Gym' },
      ] } }
    }
    if (url.includes('/api/sis/community/recognition')) {
      return { data: { recognition: [
        { id: 'r1', type: 'student_spotlight', recipient_name: 'Ana', message: 'Great work', created_at: '2026-07-20T00:00:00Z' },
      ] } }
    }
    if (url.includes('/api/sis/community/members')) {
      return { data: { members: [{ id: 'm1', name: 'Ana Student' }] } }
    }
    if (url.includes('/api/sis/events')) {
      return { data: { events: [{ id: 'e1', title: 'Field trip', start_at: '2026-08-01T15:00:00Z', all_day: false, location: 'Zoo' }] } }
    }
    return { data: {} }
  }
  return {
    apiData,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      patch: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import CommunityPage from './CommunityPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
  api.get.mockImplementation((url) => Promise.resolve(apiData(url)))
  api.post.mockImplementation(() => Promise.resolve({ data: {} }))
})

describe('CommunityPage', () => {
  it('renders the Highlights feed by default', async () => {
    render(<CommunityPage />)
    expect(await screen.findByText('Early dismissal')).toBeInTheDocument()
    expect(screen.getByText('Field trip')).toBeInTheDocument()
    expect(screen.getByText('Blue bottle')).toBeInTheDocument()
    expect(screen.getByText(/Great work/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/community/highlights'))
  })

  // iCreate, 2026-08-29: "do you see the gobbledygook under announcements?" —
  // the teaser printed the stored body, and announcements are written in the
  // editor, so the Highlights feed showed "<p><strong>Calendar</strong></p>".
  it('teases an announcement as text, not as its markup', async () => {
    render(<CommunityPage />)
    await screen.findByText('Early dismissal')
    expect(screen.getByText(/Calendar\s+Specific info will be added\./)).toBeInTheDocument()
    expect(screen.queryByText(/<p>|<strong>/)).not.toBeInTheDocument()
  })

  it('switches to the Announcements tab and shows the post button for admins', async () => {
    render(<CommunityPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }))
    expect(await screen.findByText('Post announcement')).toBeInTheDocument()
    // Announcement content loads
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/community/announcements')))
  })

  it('creates an announcement via the form', async () => {
    render(<CommunityPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }))
    fireEvent.click(await screen.findByText('Post announcement'))
    fireEvent.change(screen.getByPlaceholderText('Early dismissal Friday'), { target: { value: 'Snow day' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/community/announcements',
        expect.objectContaining({ title: 'Snow day', organization_id: 'org-1' })),
    )
  })

  it('shows the donation countdown on a lost & found item', async () => {
    render(<CommunityPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Lost & Found' }))
    expect(await screen.findByText('Blue bottle')).toBeInTheDocument()
    expect(screen.getByText(/Donate in 7 days/)).toBeInTheDocument()
  })

  it('posts a recognition', async () => {
    render(<CommunityPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Recognition' }))
    fireEvent.click(await screen.findByText('Post recognition'))
    fireEvent.change(screen.getByPlaceholderText('What are you celebrating?'), { target: { value: 'You rock' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/community/recognition',
        expect.objectContaining({ message: 'You rock', organization_id: 'org-1' })),
    )
  })
})
