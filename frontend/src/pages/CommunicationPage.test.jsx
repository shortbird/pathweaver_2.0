import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CommunicationPage from './CommunicationPage'

let authState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseChatbot: true, loading: false })
}))

vi.mock('../hooks/api/useDirectMessages', () => ({
  useConversations: () => ({
    data: { conversations: mockConversations },
    isLoading: false
  })
}))

vi.mock('../hooks/api/useGroupMessages', () => ({
  useGroups: () => ({
    data: { groups: mockGroups },
    isLoading: false,
    refetch: vi.fn()
  })
}))

vi.mock('../components/communication/ConversationList', () => ({
  default: ({ conversations, groupConversations, onSelectConversation, isLoading, onCreateGroup }) => (
    <div data-testid="conversation-list">
      <span data-testid="conv-count">{conversations?.length} conversations</span>
      <span data-testid="group-count">{groupConversations?.length} groups</span>
      <button data-testid="create-group-btn" onClick={onCreateGroup}>Create Group</button>
    </div>
  )
}))

vi.mock('../components/communication/ChatWindow', () => ({
  default: ({ conversation }) => (
    <div data-testid="chat-window">
      {conversation ? <span>{conversation.other_user?.display_name}</span> : <span>No conversation</span>}
    </div>
  )
}))

vi.mock('../components/communication/GroupChatWindow', () => ({
  default: ({ group }) => (
    <div data-testid="group-chat-window">
      <span>{group?.name}</span>
    </div>
  )
}))

vi.mock('../components/communication/CreateGroupModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="create-group-modal">Create Group Modal</div> : null
}))

vi.mock('../components/notifications/PushNotificationBanner', () => ({
  default: () => <div data-testid="push-banner">Push Banner</div>
}))

const mockConversations = [
  { id: 'c1', other_user: { id: 'u2', display_name: 'Alice' }, last_message_at: '2025-01-01' },
  { id: 'c2', other_user: { id: 'u3', display_name: 'Bob' }, last_message_at: '2025-01-02' }
]

const mockGroups = [
  { id: 'g1', name: 'Study Group', type: 'group' }
]

function renderCommunication() {
  return render(
    <MemoryRouter>
      <CommunicationPage />
    </MemoryRouter>
  )
}

describe('CommunicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'user-1', role: 'student' } }
  })

  describe('rendering', () => {
    it('renders conversation list', () => {
      renderCommunication()
      expect(screen.getByTestId('conversation-list')).toBeInTheDocument()
    })

    it('passes conversation data to list', () => {
      renderCommunication()
      expect(screen.getByTestId('conv-count')).toHaveTextContent('2 conversations')
    })

    it('passes group data to list', () => {
      renderCommunication()
      expect(screen.getByTestId('group-count')).toHaveTextContent('1 groups')
    })

    it('renders chat window', () => {
      renderCommunication()
      expect(screen.getByTestId('chat-window')).toBeInTheDocument()
    })

    it('renders push notification banner', () => {
      renderCommunication()
      expect(screen.getByTestId('push-banner')).toBeInTheDocument()
    })

    it('renders create group button in conversation list', () => {
      renderCommunication()
      expect(screen.getByTestId('create-group-btn')).toBeInTheDocument()
    })
  })

  describe('OptioBot auto-select', () => {
    it('shows OptioBot in chat window by default when chatbot enabled', async () => {
      renderCommunication()
      await waitFor(() => {
        expect(screen.getByText('OptioBot')).toBeInTheDocument()
      })
    })
  })
})
