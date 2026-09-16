import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NotificationDetailModal from './NotificationDetailModal'
import * as friends from '../../services/friendsAPI'

vi.mock('../../services/friendsAPI', () => ({
  getHold: vi.fn(),
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

function mount(notification) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationDetailModal notification={notification} isOpen onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('NotificationDetailModal for a held message', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the held words, the picture, where it was going and why, with no dead link', async () => {
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
    // The link to /family was the click that went nowhere.
    expect(screen.queryByText('View Details')).not.toBeInTheDocument()
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
