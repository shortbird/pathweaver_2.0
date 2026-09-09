import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SchoolPage from './SchoolPage'

vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ school: { id: 'org-1', name: 'iCreate', homepage: true }, loading: false }),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, effectiveRole: 'student' }),
}))
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '../services/api'

const longBody = 'This announcement body is intentionally long. '.repeat(10)

const mockAnnouncements = [
  {
    id: 'ann-1',
    title: 'Fall Newsletter',
    message: 'Welcome back to school, everyone.',
    content: 'Welcome back to school, everyone.',
    target_audience: 'everyone',
    created_at: '2026-07-01T12:00:00Z',
  },
  {
    id: 'ann-2',
    title: 'Picture Day',
    message: longBody,
    content: longBody,
    target_audience: 'parents,students',
    created_at: '2026-06-15T12:00:00Z',
  },
]

function mockArchiveResponse(overrides = {}) {
  return {
    data: {
      success: true,
      announcements: mockAnnouncements,
      total: 2,
      organization_name: 'Gryffin Microschool',
      limit: 20,
      offset: 0,
      ...overrides,
    },
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/announcements']}>
      <SchoolPage />
    </MemoryRouter>
  )
}

describe('SchoolPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(mockArchiveResponse())
    api.post.mockResolvedValue({ data: { success: true } })
  })

  describe('loading state', () => {
    it('shows a spinner while loading', async () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      renderPage()
      await waitFor(() => {
        expect(document.querySelector('.animate-spin')).toBeTruthy()
      })
    })
  })

  describe('rendering', () => {
    it('is titled with the school, not with "Announcements"', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'iCreate' })).toBeInTheDocument()
      })
    })

    it('fetches the archive from the API', async () => {
      renderPage()
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/api/announcements/archive',
          expect.objectContaining({
            params: expect.objectContaining({ limit: 20, offset: 0 }),
          })
        )
      })
    })

    it('renders sent messages in the feed, no click required', async () => {
      // The archive used to hide behind a "Messages" tab/section; the unified
      // feed IS the page now.
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
        expect(screen.getByText('Picture Day')).toBeInTheDocument()
        expect(screen.getByText('Welcome back to school, everyone.')).toBeInTheDocument()
      })
    })

    it('reports the messages it showed as read — once', async () => {
      renderPage()
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/announcements/mark-read', {
          announcement_ids: ['ann-1', 'ann-2'],
        })
      })
      expect(api.post).toHaveBeenCalledTimes(1)
    })

    it('names the school once, in the header, not under every card', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
      })
      expect(screen.getAllByText('iCreate')).toHaveLength(1)
    })

    it('shows a Read more toggle for long bodies', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Read more')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Read more'))
      expect(screen.getByText('Show less')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows an empty message when there are no announcements', async () => {
      api.get.mockResolvedValue(mockArchiveResponse({ announcements: [], total: 0 }))
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('No messages yet.')).toBeInTheDocument()
      })
    })
  })

  describe('search', () => {
    it('re-fetches with the query after typing in search', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
      })
      const input = screen.getByLabelText('Search messages')
      fireEvent.change(input, { target: { value: 'newsletter' } })
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/api/announcements/archive',
          expect.objectContaining({
            params: expect.objectContaining({ q: 'newsletter', offset: 0 }),
          })
        )
      })
    })

    it('shows a no-results message for an empty search', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
      })
      api.get.mockResolvedValue(mockArchiveResponse({ announcements: [], total: 0 }))
      const input = screen.getByLabelText('Search messages')
      fireEvent.change(input, { target: { value: 'zzz' } })
      await waitFor(() => {
        expect(screen.getByText('No messages match your search.')).toBeInTheDocument()
      })
    })
  })

  describe('pagination', () => {
    it('offers older messages when more exist on the server and appends the next page', async () => {
      api.get.mockResolvedValue(mockArchiveResponse({ total: 5 }))
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Load older messages')).toBeInTheDocument()
      })
      api.get.mockResolvedValue(
        mockArchiveResponse({
          announcements: [
            {
              id: 'ann-3',
              title: 'Field Trip',
              message: 'We are going to the museum.',
              content: 'We are going to the museum.',
              target_audience: 'everyone',
              created_at: '2026-05-01T12:00:00Z',
            },
          ],
          total: 5,
          offset: 2,
        })
      )
      fireEvent.click(screen.getByText('Load older messages'))
      await waitFor(() => {
        expect(screen.getByText('Field Trip')).toBeInTheDocument()
        // Existing items remain (appended, not replaced)
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
      })
      expect(api.get).toHaveBeenLastCalledWith(
        '/api/announcements/archive',
        expect.objectContaining({
          params: expect.objectContaining({ offset: 2 }),
        })
      )
    })

    it('hides the pager when everything is loaded', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
      })
      expect(screen.queryByText('Load older messages')).not.toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows an error message when the API fails', async () => {
      api.get.mockRejectedValue({ response: { data: { error: 'Failed to load archive' } } })
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Failed to load archive')).toBeInTheDocument()
      })
    })
  })
})
