import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AnnouncementsArchivePage from './AnnouncementsArchivePage'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('@heroicons/react/24/outline', () => ({
  MegaphoneIcon: (props) => <svg data-testid="megaphone-icon" {...props} />,
  MagnifyingGlassIcon: (props) => <svg data-testid="search-icon" {...props} />,
  ChevronDownIcon: (props) => <svg data-testid="chevron-icon" {...props} />,
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
      <AnnouncementsArchivePage />
    </MemoryRouter>
  )
}

describe('AnnouncementsArchivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(mockArchiveResponse())
  })

  describe('loading state', () => {
    it('shows a spinner while loading', () => {
      api.get.mockImplementation(() => new Promise(() => {}))
      renderPage()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  describe('rendering', () => {
    it('renders the page heading', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Announcements')).toBeInTheDocument()
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

    it('renders announcement titles and bodies', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
        expect(screen.getByText('Picture Day')).toBeInTheDocument()
        expect(screen.getByText('Welcome back to school, everyone.')).toBeInTheDocument()
      })
    })

    it('shows the organization name', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('From Gryffin Microschool')).toBeInTheDocument()
      })
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
        expect(screen.getByText('No announcements yet.')).toBeInTheDocument()
      })
    })
  })

  describe('search', () => {
    it('re-fetches with the query after typing in search', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
      })
      const input = screen.getByLabelText('Search announcements')
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
      const input = screen.getByLabelText('Search announcements')
      fireEvent.change(input, { target: { value: 'zzz' } })
      await waitFor(() => {
        expect(screen.getByText('No announcements match your search.')).toBeInTheDocument()
      })
    })
  })

  describe('pagination', () => {
    it('shows Load more when there are more announcements and appends the next page', async () => {
      api.get.mockResolvedValue(mockArchiveResponse({ total: 5 }))
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Load more')).toBeInTheDocument()
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
      fireEvent.click(screen.getByText('Load more'))
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

    it('hides Load more when everything is loaded', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Fall Newsletter')).toBeInTheDocument()
      })
      expect(screen.queryByText('Load more')).not.toBeInTheDocument()
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
