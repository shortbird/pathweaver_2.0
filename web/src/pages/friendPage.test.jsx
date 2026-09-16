/**
 * A friend's page -- their work through the peer grant, what they are
 * working on, and Collaborate. What matters: the feed is filtered to that
 * one student, shared quests are marked, the page is a dead end for anyone
 * who is not an active friend, Message shows only when both families allow
 * it, and Collaborate sends the invite to the right friend for the picked
 * quest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import FriendPage from './FriendPage'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../services/api', () => ({
  default: api,
  observerAPI: { getFeed: (params) => api.get('/api/observers/feed', { params }) },
}))
vi.mock('../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(() => Promise.resolve(true)) }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('../components/observer/FeedCard', () => ({
  default: ({ item }) => <div data-testid="feed-card">{item.title}</div>,
}))

const render = () => rtlRender(
  <MemoryRouter initialEntries={['/connections/p1']}>
    <Routes>
      <Route path="/connections/:peerId" element={<FriendPage />} />
    </Routes>
  </MemoryRouter>
)

const PAGE = {
  peer: { id: 'p1', display_name: 'Ada', avatar_url: null },
  connection_id: 'c1',
  friends_since: '2026-09-16T00:00:00Z',
  can_message: true,
  shared_classes: ['Algebra 1'],
  quests: [
    { id: 'q2', title: 'Class project', image_url: null, shared: true },
    { id: 'q1', title: 'Explore a zoo', image_url: null, shared: false },
  ],
  my_quests: [{ id: 'q2', title: 'Class project', shared: true }, { id: 'q3', title: 'Build a kite', shared: false }],
}

const mockLoad = (page, feedItems = []) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/observers/feed')) {
      return Promise.resolve({ data: { items: feedItems, has_more: false } })
    }
    if (url.includes('/connections/friends/')) {
      return page
        ? Promise.resolve({ data: { data: page } })
        : Promise.reject({ response: { status: 400, data: { error: 'You are not friends with this student.' } } })
    }
    return Promise.resolve({ data: {} })
  })
}

beforeEach(() => vi.clearAllMocks())

describe('FriendPage', () => {
  it('shows the friend, the shared context, their quests and their work', async () => {
    mockLoad(PAGE, [{ id: 'f1', title: 'Built a kite', student: { id: 'p1' } }])
    render()
    expect(await screen.findByRole('heading', { name: 'Ada' })).toBeInTheDocument()
    // One line: since when, and the class they share (the date renders in
    // the viewer's zone, so only its shape is asserted).
    expect(screen.getByText(/friends since \w+ \d+, 2026 · in algebra 1 with you/i)).toBeInTheDocument()

    const quests = screen.getByRole('list')
    const rows = within(quests).getAllByRole('link')
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['/quests/q2', '/quests/q1'])
    expect(within(rows[0]).getByText(/you are both on this/i)).toBeInTheDocument()
    expect(within(rows[1]).queryByText(/you are both on this/i)).toBeNull()

    expect(await screen.findByTestId('feed-card')).toHaveTextContent('Built a kite')
    expect(api.get).toHaveBeenCalledWith('/api/observers/feed', { params: expect.objectContaining({ studentId: 'p1' }) })
    expect(screen.getByRole('link', { name: /message/i })).toHaveAttribute('href', '/messages?user=p1')
  })

  it('invites the friend to a picked quest', async () => {
    mockLoad(PAGE)
    api.post.mockResolvedValue({ data: { data: { invited: true, already_on_quest: false } } })
    render()
    await userEvent.click(await screen.findByRole('button', { name: /collaborate/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/collaborate with ada/i)
    // The quest the friend is already on offers a nudge, not an invite.
    expect(within(dialog).getByRole('button', { name: /nudge/i })).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /^invite$/i }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/friends/p1/collaborate', { quest_id: 'q3' })
    })
    expect(toast.success).toHaveBeenCalledWith('Invited Ada.')
  })

  it('hides Message when a family has not allowed it', async () => {
    mockLoad({ ...PAGE, can_message: false, quests: [], my_quests: [] })
    render()
    await screen.findByRole('heading', { name: 'Ada' })
    expect(screen.queryByRole('link', { name: /message/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /collaborate/i })).toBeNull()
    expect(await screen.findByText(/has not shared any work yet/i)).toBeInTheDocument()
  })

  it('is a dead end for a student who is not a friend', async () => {
    mockLoad(null)
    render()
    expect(await screen.findByText(/not friends with this student/i)).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith('/api/observers/feed', expect.anything())
  })
})
