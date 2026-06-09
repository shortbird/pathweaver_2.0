import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ConversationList from './ConversationList'

let authState = { user: { id: 'u1', role: 'student' } }
let mockContacts = []

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../services/api', () => ({
  parentAPI: { getMyChildren: vi.fn().mockResolvedValue({ data: { children: [] } }) },
  observerAPI: { getMyObservers: vi.fn().mockResolvedValue({ data: { observers: [] } }) }
}))
vi.mock('../../hooks/api/useDirectMessages', () => ({
  useMessagingContacts: () => ({ data: { contacts: mockContacts } })
}))

const conversations = [
  { id: 's1', other_user: { id: 's1', first_name: 'Sam', last_name: 'Smith', role: 'student' }, last_message_at: '2025-01-02T00:00:00Z', last_message_preview: 'Hi Sam', unread_count: 2 }
]
const groups = [
  { id: 'g1', name: 'Study Group', last_message_at: '2025-01-01T00:00:00Z', unread_count: 0, member_count: 3 }
]

function renderList(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConversationList
        conversations={conversations}
        groupConversations={groups}
        selectedConversation={null}
        onSelectConversation={vi.fn()}
        isLoading={false}
        onCreateGroup={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  )
}

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'u1', role: 'student' } }
    mockContacts = [
      { id: 's1', first_name: 'Sam', last_name: 'Smith', role: 'student', relationship: 'student' },
      { id: 'sup', display_name: 'Optio Support', relationship: 'support' }
    ]
  })

  it('splits active conversations from the contacts directory', async () => {
    renderList()
    await waitFor(() => expect(screen.getByText('Conversations')).toBeInTheDocument())
    expect(screen.getByText('Contacts')).toBeInTheDocument()
    // Active thread (Sam) with its preview, plus the group, under Conversations
    expect(screen.getByText('Sam Smith')).toBeInTheDocument()
    expect(screen.getByText('Hi Sam')).toBeInTheDocument()
    expect(screen.getByText('Study Group')).toBeInTheDocument()
    // Optio Support (no thread) shows in the directory with the Optio logo
    expect(screen.getByText('Optio Support')).toBeInTheDocument()
    expect(screen.getByAltText('Optio Support')).toBeInTheDocument()
  })

  it('does not render relationship pills', () => {
    renderList()
    expect(screen.queryByText('Student')).not.toBeInTheDocument()
    expect(screen.queryByText('Advisor')).not.toBeInTheDocument()
  })

  it('filters by search query', async () => {
    renderList()
    await waitFor(() => expect(screen.getByText('Sam Smith')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'Study' } })
    expect(screen.getByText('Study Group')).toBeInTheDocument()
    expect(screen.queryByText('Sam Smith')).not.toBeInTheDocument()
  })

  it('auto-selects the most recent conversation on desktop', async () => {
    const onSelect = vi.fn()
    renderList({ onSelectConversation: onSelect })
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
    expect(onSelect.mock.calls[0][0].id).toBe('s1')
  })

  it('shows the New group button only for users who can create groups', () => {
    renderList()
    expect(screen.queryByText('New group')).not.toBeInTheDocument()
    authState = { user: { id: 'a1', role: 'advisor' } }
    renderList()
    expect(screen.getByText('New group')).toBeInTheDocument()
  })

  it('shows an empty state when there is nothing to show', () => {
    mockContacts = []
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ConversationList
          conversations={[]}
          groupConversations={[]}
          selectedConversation={{ id: 'x' }}
          onSelectConversation={vi.fn()}
          isLoading={false}
        />
      </QueryClientProvider>
    )
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })
})
