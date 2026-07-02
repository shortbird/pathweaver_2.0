import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import GroupChatWindow from './GroupChatWindow'

let groupMessages = { data: { messages: [] }, isLoading: false }
let groupDetails = { data: null }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../hooks/api/useGroupMessages', () => ({
  useGroupMessages: () => groupMessages,
  useGroup: () => groupDetails,
  useSendGroupMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMarkGroupAsRead: () => ({ mutate: vi.fn() }),
  useToggleGroupMessageReaction: () => ({ mutate: vi.fn() }),
  useEditGroupMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteGroupMessage: () => ({ mutate: vi.fn() }),
  usePinGroupMessage: () => ({ mutate: vi.fn(), isPending: false })
}))
vi.mock('../../hooks/api/useMessagingRealtime', () => ({
  default: vi.fn(),
  useMessagingRealtime: vi.fn()
}))
vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('./GroupSettingsModal', () => ({ default: () => null }))

// jsdom doesn't implement scrollIntoView (used by the auto-scroll effect).
Element.prototype.scrollIntoView = vi.fn()

const group = { id: 'g1', name: 'Study Group', member_count: 3 }

describe('GroupChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    groupMessages = { data: { messages: [] }, isLoading: false }
    groupDetails = { data: null }
  })

  it('shows a placeholder when no group is selected', () => {
    render(<GroupChatWindow group={null} />)
    expect(screen.getByText('Select a group chat')).toBeInTheDocument()
  })

  it('renders the group header and empty state', () => {
    render(<GroupChatWindow group={group} />)
    expect(screen.getByText('Study Group')).toBeInTheDocument()
    expect(screen.getByText('3 members')).toBeInTheDocument()
    expect(screen.getByText(/No messages yet/i)).toBeInTheDocument()
  })

  it('renders group messages from self and others', () => {
    groupMessages = {
      data: {
        messages: [
          { id: 'm1', sender_id: 'u1', message_content: 'Mine', created_at: '2025-01-01T10:00:00Z' },
          { id: 'm2', sender_id: 'other', message_content: 'Theirs', sender: { first_name: 'Bo', last_name: 'Lee' }, created_at: '2025-01-01T10:01:00Z' }
        ]
      },
      isLoading: false
    }
    render(<GroupChatWindow group={group} />)
    expect(screen.getByText('Mine')).toBeInTheDocument()
    expect(screen.getByText('Theirs')).toBeInTheDocument()
    expect(screen.getByText('Bo Lee')).toBeInTheDocument()
  })

  it('shows the pinned banner and the announcement-only notice for non-admins', () => {
    groupDetails = {
      data: {
        group: {
          id: 'g1',
          announcement_only: true,
          members: [{ user_id: 'u1', role: 'member' }],
          pinned_message: {
            id: 'm1',
            sender: { first_name: 'Bo', last_name: 'Lee' },
            message_content: 'Read the syllabus',
            created_at: '2025-01-01T10:00:00Z'
          }
        }
      }
    }
    render(<GroupChatWindow group={group} />)
    expect(screen.getByText(/Pinned/)).toBeInTheDocument()
    expect(screen.getByText('Read the syllabus')).toBeInTheDocument()
    expect(screen.getByText('Only teachers can post in this group')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Type a message...')).not.toBeInTheDocument()
  })

  it('keeps the composer for admins when announcement-only is on', () => {
    groupDetails = {
      data: {
        group: {
          id: 'g1',
          announcement_only: true,
          members: [{ user_id: 'u1', role: 'admin' }]
        }
      }
    }
    render(<GroupChatWindow group={group} />)
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
    expect(screen.queryByText('Only teachers can post in this group')).not.toBeInTheDocument()
  })
})
