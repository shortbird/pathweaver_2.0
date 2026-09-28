import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NotificationsPage from './NotificationsPage'
import api from '../../services/api'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'marika', role: 'org_managed' } }),
}))

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(() => Promise.resolve({})), delete: vi.fn(() => Promise.resolve({})) },
}))

vi.mock('../../services/supabaseClient', () => ({ supabase: {} }))

vi.mock('../../components/notifications/SendNotificationModal', () => ({ default: () => null }))

vi.mock('date-fns', () => ({ formatDistanceToNow: () => '5 minutes' }))

const TYPES = [
  { key: 'messages', label: 'New messages' },
  { key: 'school', label: 'From the school' },
  { key: 'held', label: 'Held messages' },
]

const row = (i, extra = {}) => ({
  id: `n${i}`,
  type: 'message_received',
  title: `Notification ${i}`,
  message: `Body ${i}`,
  link: '/inbox',
  is_read: true,
  created_at: '2026-09-20T10:00:00Z',
  metadata: {},
  ...extra,
})

/** A server that really pages: page N is rows (N-1)*limit .. N*limit-1. */
function serve(all) {
  api.get.mockImplementation((url) => {
    if (url === '/api/notifications/types') return Promise.resolve({ data: { types: TYPES } })
    const params = new URL(url, 'http://x').searchParams
    const page = Number(params.get('page'))
    const limit = Number(params.get('limit'))
    return Promise.resolve({
      data: { notifications: all.slice((page - 1) * limit, page * limit), unread_count: 0 },
    })
  })
}

const listCalls = () => api.get.mock.calls
  .map(([url]) => url)
  .filter((url) => url.startsWith('/api/notifications?'))
  .map((url) => new URL(url, 'http://x').searchParams)

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/inbox" element={<div>Inbox page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('NotificationsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  // 519f371d (iCreate): "When I click Load More on notifications, it just
  // keeps showing me the same notifications over and over, not going deeper
  // to find older ones."
  it('Load more appends the next, older page instead of page one again', async () => {
    serve(Array.from({ length: 25 }, (_, i) => row(i)))
    mount()
    await screen.findByText('Notification 0')
    expect(screen.queryByText('Notification 20')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Notification 24')

    expect(screen.getAllByText(/^Notification \d+$/)).toHaveLength(25)
    expect(screen.getAllByText('Notification 0')).toHaveLength(1)
    expect(listCalls().map((p) => p.get('page'))).toEqual(['1', '2'])
    // Five rows is a short page: there is nothing older to load.
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  // d1bb050c (iCreate): "If I click on 'view' on a notification, it doesn't
  // show me more about that message." View followed the link; the text opened
  // the detail. Both open the detail now.
  it('View opens the detail, which carries the link as its action', async () => {
    serve([row(1, { title: 'Pat sent you a message', message: 'See you at pickup' })])
    mount()
    await screen.findByText('Pat sent you a message')

    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    const heading = await screen.findByRole('heading', { name: 'Pat sent you a message' })
    expect(screen.queryByText('Inbox page')).toBeNull()
    const dialog = heading.closest('.max-w-2xl')
    expect(within(dialog).getByText('View Details').closest('a')).toHaveAttribute('href', '/inbox')
  })

  it('offers View on a notification with no link too', async () => {
    serve([row(1, { link: null })])
    mount()
    await screen.findByText('Notification 1')
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(await screen.findByRole('heading', { name: 'Notification 1' })).toBeInTheDocument()
  })

  // 04e24d8c (iCreate): a search bar and a way to pick the kind.
  it('sends the search once typing pauses, and the kind as type', async () => {
    serve([row(1)])
    mount()
    await screen.findByText('Notification 1')
    expect(listCalls()[0].get('q')).toBeNull()
    expect(listCalls()[0].get('type')).toBeNull()

    fireEvent.change(screen.getByLabelText('Search notifications'), { target: { value: 'not ' } })
    fireEvent.change(screen.getByLabelText('Search notifications'), { target: { value: 'not accounted' } })
    await waitFor(() => expect(listCalls().some((p) => p.get('q') === 'not accounted')).toBe(true))
    // Debounced: the half-typed word was never sent.
    expect(listCalls().some((p) => p.get('q') === 'not')).toBe(false)

    const select = screen.getByLabelText('Kind of notification')
    await within(select).findByText('From the school')
    fireEvent.change(select, { target: { value: 'school' } })
    await waitFor(() => {
      const last = listCalls().at(-1)
      expect(last.get('type')).toBe('school')
      expect(last.get('q')).toBe('not accounted')
      expect(last.get('page')).toBe('1')
    })
  })

  it('pages a filtered list with the filter kept', async () => {
    serve(Array.from({ length: 25 }, (_, i) => row(i)))
    mount()
    await screen.findByText('Notification 0')
    const select = screen.getByLabelText('Kind of notification')
    await within(select).findByText('New messages')
    fireEvent.change(select, { target: { value: 'messages' } })
    await waitFor(() => expect(listCalls().at(-1).get('type')).toBe('messages'))
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await waitFor(() => {
      const last = listCalls().at(-1)
      expect(last.get('page')).toBe('2')
      expect(last.get('type')).toBe('messages')
    })
  })
})
