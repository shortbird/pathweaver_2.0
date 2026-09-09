import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatWindow from './ChatWindow'
import useMessagingRealtime from '../../hooks/api/useMessagingRealtime'

let messagesState = { data: { messages: [] }, isLoading: false, error: null, refetch: vi.fn() }
const sendMutate = vi.fn().mockResolvedValue({})

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../hooks/api/useDirectMessages', () => ({
  useConversationMessages: () => messagesState,
  useSendMessage: () => ({ mutateAsync: sendMutate, isPending: false }),
  useMarkConversationAsRead: () => ({ mutate: vi.fn() }),
  useToggleMessageReaction: () => ({ mutate: vi.fn() }),
  useEditMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMessage: () => ({ mutate: vi.fn() })
}))
vi.mock('../../hooks/api/useMessagingRealtime', () => ({
  default: vi.fn(),
  useMessagingRealtime: vi.fn()
}))
vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

const advisor = { id: 'c1', type: 'advisor', other_user: { id: 'a1', first_name: 'Ada', last_name: 'Lovelace' } }
const support = { id: 'sup', type: 'support', other_user: { id: 'sup', display_name: 'Optio Support' } }
// The shape contactToConversation produces: `id` is the other person, and the
// conversation row id rides alongside.
const parentThread = {
  id: 'p1',
  conversation_id: 'convo-9',
  type: 'friend',
  other_user: { id: 'p1', first_name: 'Sydney', last_name: 'Olson' }
}

describe('ChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendMutate.mockResolvedValue({})
    messagesState = { data: { messages: [] }, isLoading: false, error: null, refetch: vi.fn() }
  })

  it('shows a friendly empty state with no conversation selected', () => {
    render(<ChatWindow conversation={null} />)
    expect(screen.getByText('Your messages')).toBeInTheDocument()
  })

  it('renders an advisor conversation header and composer', () => {
    render(<ChatWindow conversation={advisor} />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Your teacher')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Message Ada/i)).toBeInTheDocument()
  })

  it('uses the Optio logo for the support conversation', () => {
    render(<ChatWindow conversation={support} />)
    expect(screen.getByAltText('Optio Support')).toBeInTheDocument()
    expect(screen.getByText('We usually reply within a day')).toBeInTheDocument()
  })

  it('sends a message via the composer', () => {
    render(<ChatWindow conversation={advisor} />)
    const input = screen.getByPlaceholderText(/Message Ada/i)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(sendMutate).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 'a1', content: 'Hello' }))
  })

  // The backend broadcasts on `dm:{conversation_id}`, but every row in the list
  // is built by contactToConversation, whose `id` is the OTHER PERSON's user id
  // (that is what the message queries and the send endpoint are keyed on). The
  // hook was handed that id as its topic, so it listened on a channel nothing
  // publishes to and DM realtime was dead on the web -- every thread silently
  // fell back to its 60s poll.
  it('subscribes to the conversation row, not the other person', () => {
    render(<ChatWindow conversation={parentThread} />)
    expect(useMessagingRealtime).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dm', id: 'p1', topicId: 'convo-9' })
    )
  })

  it('attaches live updates to a new thread as soon as the first send returns', async () => {
    // A thread opened from the contacts directory has no conversation row yet;
    // the first send creates it, and the send response is the earliest anything
    // can know its id.
    sendMutate.mockResolvedValue({ conversation_id: 'convo-new' })
    render(<ChatWindow conversation={{ ...parentThread, conversation_id: null }} />)
    expect(useMessagingRealtime).toHaveBeenLastCalledWith(
      expect.objectContaining({ topicId: null })
    )

    const input = screen.getByPlaceholderText(/Message Sydney/i)
    fireEvent.change(input, { target: { value: 'Hi' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(useMessagingRealtime).toHaveBeenLastCalledWith(
      expect.objectContaining({ topicId: 'convo-new' })
    ))
  })

  it('shows an error state with a retry when messages fail to load', () => {
    const refetch = vi.fn()
    messagesState = { data: null, isLoading: false, error: new Error('boom'), refetch }
    render(<ChatWindow conversation={advisor} />)
    expect(screen.getByText("Couldn't load messages")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetch).toHaveBeenCalled()
  })
})
