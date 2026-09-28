import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NotificationDetailModal from './NotificationDetailModal'
import * as friends from '../../services/friendsAPI'

vi.mock('../../services/friendsAPI', () => ({
  getHold: vi.fn(),
}))

let authUser = null
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => {
    if (!authUser) throw new Error('useAuth must be used within an AuthProvider')
    return { user: authUser }
  },
}))

vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '5 minutes',
}))

const held = {
  id: 'h1',
  type: 'peer_text_held',
  title: 'Sam: a message was held',
  message: 'Sam wrote a message in a class chat that our safety check held. It was not sent. "add me on snap"',
  link: '/family',
  metadata: { hold_id: 'h1', surface: 'group_message', stage: 'refused', author_id: 'kid' },
  created_at: '2026-09-15T10:00:00Z',
  is_read: false,
}

const holdDetail = {
  id: 'h1', surface: 'group_message', stage: 'refused', text: 'add me on snap',
  reasons: ['shares a username for another app'],
  attachments: [{ url: 'https://signed.example/a.jpg?token=1', type: 'image', name: 'a.jpg', size: 10 }],
  created_at: '2026-09-15T10:00:00Z',
  author: { id: 'kid', display_name: 'Sam', avatar_url: null },
  peer: null,
  group: { id: 'g1', name: 'Period 3 Biology' },
}

function mount(notification, { route = '/notifications', role } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <NotificationDetailModal notification={notification} isOpen onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
  authUser = role ? { role } : null
  return render(tree)
}

describe('NotificationDetailModal for a held message', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the held words, the picture, where it was going and why', async () => {
    friends.getHold.mockResolvedValue(holdDetail)
    mount(held)

    await waitFor(() => expect(screen.getByTestId('held-message-detail')).toBeInTheDocument())
    expect(friends.getHold).toHaveBeenCalledWith('h1')
    expect(screen.getByText(/Sam wrote a class chat message in Period 3 Biology/)).toBeInTheDocument()
    expect(screen.getByText(/held before it was sent/i)).toBeInTheDocument()
    expect(screen.getByText('add me on snap')).toBeInTheDocument()
    // The notification's own summary is not repeated above the detail.
    expect(screen.queryByText(/that our safety check held/)).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'a.jpg' })).toHaveAttribute('src', 'https://signed.example/a.jpg?token=1')
    expect(screen.getByText(/Why: shares a username for another app/)).toBeInTheDocument()
    expect(screen.getByText('Safety Check')).toBeInTheDocument()
  })

  // d1bb050c (iCreate): "There is no way to do anything about it directly
  // from the pop-up." This used to pin the opposite -- the link was dropped
  // for every held message because, read FROM /family, it went nowhere
  // (2026-09-15). linksToCurrentPage now handles that case on its own, so the
  // action comes back everywhere else.
  it('offers the link as its action when it leads somewhere', async () => {
    friends.getHold.mockResolvedValue(holdDetail)
    mount(held)
    const action = await screen.findByText('Review this message')
    expect(action.closest('a')).toHaveAttribute('href', '/family')
  })

  it('still leaves the action out when the reader is already on that page', async () => {
    friends.getHold.mockResolvedValue(holdDetail)
    mount(held, { route: '/family' })
    await waitFor(() => expect(screen.getByTestId('held-message-detail')).toBeInTheDocument())
    expect(screen.queryByText('Review this message')).not.toBeInTheDocument()
  })

  it('hides an /admin link from anyone but a superadmin', async () => {
    friends.getHold.mockResolvedValue(holdDetail)
    const adminLinked = { ...held, link: '/admin/moderation' }
    const { unmount } = mount(adminLinked, { role: 'org_managed' })
    await waitFor(() => expect(screen.getByTestId('held-message-detail')).toBeInTheDocument())
    expect(screen.queryByText('Review this message')).not.toBeInTheDocument()
    unmount()

    mount(adminLinked, { role: 'superadmin' })
    const action = await screen.findByText('Review this message')
    expect(action.closest('a')).toHaveAttribute('href', '/admin/moderation')
  })

  it('shows a non-admin link it can reach, whatever the role', async () => {
    friends.getHold.mockResolvedValue(holdDetail)
    mount({ ...held, link: '/sis/messaging?tab=held' }, { role: 'org_managed' })
    const action = await screen.findByText('Review this message')
    expect(action.closest('a')).toHaveAttribute('href', '/sis/messaging?tab=held')
  })

  it('falls back to the notification text when the hold cannot be loaded', async () => {
    friends.getHold.mockRejectedValue({ response: { data: { error: 'Not found' } } })
    mount(held)
    expect(await screen.findByText('Not found')).toBeInTheDocument()
    expect(screen.getByText(/that our safety check held/)).toBeInTheDocument()
  })

  it('keeps the link for a notification recorded before hold ids existed', () => {
    mount({ ...held, metadata: null })
    expect(friends.getHold).not.toHaveBeenCalled()
    expect(screen.getByText('View Details').closest('a')).toHaveAttribute('href', '/family')
  })
})
