/**
 * The friends-on-this-quest line and the Collaborate door on a quest page.
 * Nothing renders for a student with no friends; a friend on the quest is
 * named with Message beside them; Collaborate names the quest and sends
 * the invite to the picked friend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import QuestFriendsCard from './QuestFriendsCard'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

const QUEST = { id: 'q1', title: 'Explore a zoo' }
const mount = (onQuest, active, props = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/quests/q1/friends')) return Promise.resolve({ data: { data: { friends: onQuest } } })
    return Promise.resolve({ data: { data: { active, incoming: [], outgoing: [], awaiting_approval: [] } } })
  })
  return render(
    <MemoryRouter>
      <QuestFriendsCard quest={QUEST} isEnrolled {...props} />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('QuestFriendsCard', () => {
  it('renders nothing for a student with no friends', async () => {
    mount([], [])
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: /collaborate/i })).toBeNull()
  })

  it('names a friend on the quest, with Message when allowed', async () => {
    mount(
      [{ id: 'p1', display_name: 'Ada', avatar_url: null, can_message: true }],
      [{ id: 'c1', peer: { id: 'p1', display_name: 'Ada' } }, { id: 'c2', peer: { id: 'p2', display_name: 'Bo' } }],
    )
    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.getByText(/is on this too/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /message/i })).toHaveAttribute('href', '/messages?user=p1')
    expect(screen.getByRole('link', { name: /ada/i })).toHaveAttribute('href', '/connections/p1')
  })

  it('invites a picked friend to this quest', async () => {
    mount([], [{ id: 'c2', peer: { id: 'p2', display_name: 'Bo' } }])
    api.post.mockResolvedValue({ data: { data: { invited: true } } })
    await userEvent.click(await screen.findByRole('button', { name: /collaborate/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/collaborate on explore a zoo/i)
    await userEvent.click(within(dialog).getByRole('button', { name: /^invite$/i }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/connections/friends/p2/collaborate', { quest_id: 'q1' })
    })
  })

  it('offers no Collaborate to a parent on the child\'s copy', async () => {
    mount([], [{ id: 'c2', peer: { id: 'p2', display_name: 'Bo' } }], { hidden: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(api.get).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /collaborate/i })).toBeNull()
  })
})
