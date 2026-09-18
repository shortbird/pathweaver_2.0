/**
 * FeedFriendsCard -- friends at the top of the student's Feed: the
 * invitation when there are none, the row when there are some, and, for a
 * kid whose parent holds the switch, the ask itself.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../services/api'
import FeedFriendsCard from './FeedFriendsCard'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const ELIGIBLE = { state: 'eligible', reason: null, who_can_enable: null }
const NONE = { active: [], incoming: [], outgoing: [], awaiting_approval: [] }
const friend = (id, display_name) => ({ id: `c-${id}`, status: 'active', peer: { id, display_name, avatar_url: null } })

const mount = (eligibility, connections = NONE) => {
  api.get.mockImplementation((url) => {
    if (url.includes('eligibility')) return Promise.resolve({ data: { data: eligibility } })
    if (url === '/api/connections') return Promise.resolve({ data: { data: connections } })
    return Promise.resolve({ data: {} })
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><FeedFriendsCard /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('FeedFriendsCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invites a student with no friends yet, with the way in', async () => {
    mount(ELIGIBLE)
    expect(await screen.findByText('Add friends to see their work here')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add a friend/i })).toHaveAttribute('href', '/connections')
  })

  it('shows the friends with Add first, and counts the requests waiting', async () => {
    mount(ELIGIBLE, { ...NONE, active: [friend('p1', 'Ada Lovelace')], incoming: [friend('p2', 'Bo')] })
    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a friend' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/connections/p1')
    expect(screen.getByTestId('feed-friends-badge')).toHaveTextContent('1')
    expect(screen.getByText('1 request')).toBeInTheDocument()
  })

  it('lets a kid whose parent holds the switch ask them from the feed', async () => {
    // ask_parent on the server: a push to the parent's phone, a web push and
    // an email, each opening the child's Friends settings.
    api.post.mockResolvedValue({ data: { data: { asked: 1 } } })
    mount({ state: 'friends_off', reason: 'Ask Lynette to turn on Friends for you.', who_can_enable: 'parent' })
    expect(await screen.findByText('Ask Lynette to turn on Friends for you.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /ask my parent/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/connections/ask-parent', {}))
    expect(await screen.findByText('Asked. Your parent will get a notification and an email.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ask my parent/i })).toBeNull()
  })

  it('is one line to the Friends page when Friends is off with nobody to ask', async () => {
    mount({ state: 'friends_off', reason: 'Ask your school to turn on Friends.', who_can_enable: 'org_admin' })
    const line = await screen.findByTestId('feed-friends-off')
    expect(line).toHaveTextContent('Ask your school to turn on Friends.')
    expect(line).toHaveAttribute('href', '/connections')
  })

  it('shows nothing when the school has the module off', async () => {
    mount({ state: 'module_off', reason: 'Friends is not turned on at your school.', who_can_enable: null })
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('feed-friends-off')).toBeNull()
    expect(screen.queryByTestId('feed-friends-empty')).toBeNull()
  })
})
