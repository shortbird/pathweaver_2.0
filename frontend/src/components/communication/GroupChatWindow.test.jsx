import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import GroupChatWindow from './GroupChatWindow'

let groupMessages = { data: { messages: [] }, isLoading: false }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../hooks/api/useGroupMessages', () => ({
  useGroupMessages: () => groupMessages,
  useSendGroupMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMarkGroupAsRead: () => ({ mutate: vi.fn() })
}))
vi.mock('./GroupSettingsModal', () => ({ default: () => null }))

// jsdom doesn't implement scrollIntoView (used by the auto-scroll effect).
Element.prototype.scrollIntoView = vi.fn()

const group = { id: 'g1', name: 'Study Group', member_count: 3 }

describe('GroupChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    groupMessages = { data: { messages: [] }, isLoading: false }
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
})
