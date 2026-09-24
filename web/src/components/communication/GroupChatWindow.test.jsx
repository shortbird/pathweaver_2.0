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

  it('names the surface a message was sent from when the backend supplies it', () => {
    groupMessages = {
      data: {
        messages: [
          { id: 'm1', sender_id: 'u1', message_content: 'Mine', sent_from: 'web', created_at: '2025-01-01T10:00:00Z' },
          { id: 'm2', sender_id: 'other', message_content: 'Theirs', sent_from: 'mobile', sender: { first_name: 'Bo', last_name: 'Lee' }, created_at: '2025-01-01T10:01:00Z' },
          { id: 'm3', sender_id: 'other', message_content: 'Older', sender: { first_name: 'Bo', last_name: 'Lee' }, created_at: '2025-01-01T10:02:00Z' }
        ]
      },
      isLoading: false
    }
    render(<GroupChatWindow group={group} />)
    expect(screen.getByLabelText('Sent from Web')).toBeInTheDocument()
    expect(screen.getByLabelText('Sent from Mobile')).toBeInTheDocument()
    // One message had no stamp (pre-2026-09-16 or a non-superadmin viewer): two tags, not three.
    expect(screen.getAllByLabelText(/Sent from/)).toHaveLength(2)
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

  // A class chat is named after its class and nothing else. A parent arriving
  // from a notification could not tell whose class it was without leaving the
  // thread to look it up -- the "before I can even respond" half of the report
  // that prompted the per-child sections in ConversationList.
  describe('the class-chat subtitle', () => {
    const classChat = {
      id: 'g1',
      name: 'Peak Play PE Parent Chat',
      member_count: 12,
      for_students: [{ id: 'd', first_name: 'Daxton', display_name: 'Daxton T' }],
      class_meeting: { day_of_week: 2, start_time: '09:30:00' }
    }

    it('names the child and when the class meets', () => {
      render(<GroupChatWindow group={classChat} />)
      expect(screen.getByText('Daxton · Tue 9:30 AM')).toBeInTheDocument()
    })

    it('prefers the refreshed detail over the list row it was opened from', () => {
      groupDetails = {
        data: {
          group: {
            id: 'g1',
            members: [{ user_id: 'u1', role: 'member' }],
            for_students: [
              { id: 'd', first_name: 'Daxton' },
              { id: 'r', first_name: 'Rivers' }
            ],
            class_meeting: { day_of_week: 4, start_time: '14:00:00' }
          }
        }
      }
      render(<GroupChatWindow group={classChat} />)
      expect(screen.getByText('Daxton, Rivers · Thu 2:00 PM')).toBeInTheDocument()
    })

    it('stays out of the way for a group that is not about a child', () => {
      render(<GroupChatWindow group={group} />)
      expect(screen.getByText('Study Group')).toBeInTheDocument()
      expect(screen.queryByText(/·/)).not.toBeInTheDocument()
    })
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

  // 9b46c748 (iCreate, 2026-09-23): the group's read receipt.
  it('says how many members have read past our last message', () => {
    groupMessages = { data: { messages: [
      { id: 'm1', sender_id: 'u1', message_content: 'Room 4 is open', created_at: '2025-01-01T10:00:00Z' },
    ] }, isLoading: false }
    groupDetails = { data: { members: [
      { user_id: 'u1', last_read_at: '2025-01-01T10:00:00Z', user: { first_name: 'Me' } },
      { user_id: 'a', last_read_at: '2025-01-01T10:05:00Z', user: { first_name: 'Ada', last_name: 'L' } },
      { user_id: 'b', last_read_at: '2025-01-01T09:00:00Z', user: { first_name: 'Bo', last_name: 'M' } },
      { user_id: 'c', last_read_at: null, user: { first_name: 'Cy' } },
    ] } }
    render(<GroupChatWindow group={group} />)
    expect(screen.getByText('· Seen by 1')).toHaveAttribute('title', 'Ada L')
  })

  it('offers Make a task on each message when the school reads it', () => {
    groupMessages = { data: { messages: [
      { id: 'm1', sender_id: 'other', message_content: 'Hi', sender: { first_name: 'Bo' }, created_at: '2025-01-01T10:00:00Z' },
    ] }, isLoading: false }
    const onMakeTask = vi.fn()
    render(<GroupChatWindow group={group} source={{ school: true }} onMakeTask={onMakeTask} />)
    screen.getByRole('button', { name: 'Make a task' }).click()
    expect(onMakeTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })
})
