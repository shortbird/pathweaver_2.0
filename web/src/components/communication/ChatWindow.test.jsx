import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatWindow from './ChatWindow'
import useMessagingRealtime from '../../hooks/api/useMessagingRealtime'
import api from '../../services/api'
import { toast } from 'react-hot-toast'

let messagesState = { data: { messages: [] }, isLoading: false, error: null, refetch: vi.fn() }
const sendMutate = vi.fn().mockResolvedValue({})

let authUser = { id: 'u1' }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }))
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
vi.mock('react-hot-toast', () => {
  const toast = { error: vi.fn(), success: vi.fn() }
  return { default: toast, toast }
})

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
    authUser = { id: 'u1' }
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
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true }) // Ctrl+Enter sends (e937883a)
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
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true }) // Ctrl+Enter sends (e937883a)

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
  // Ticket fc21a562 (Tanner, superadmin): "Email this to me disappeared. I want
  // it back." Restored for superadmins only, as it was before 2026-10-01.
  describe('Email this to me', () => {
    const received = {
      id: 'm1', sender_id: 'a1', recipient_id: 'u1', message_content: 'Help with credit',
      created_at: '2026-10-05T15:00:00Z'
    }

    it('shows the action to a superadmin and mails the message on click', async () => {
      authUser = { id: 'u1', role: 'superadmin' }
      messagesState = { data: { messages: [received] }, isLoading: false, error: null, refetch: vi.fn() }
      api.post.mockResolvedValue({ data: { data: { emailed_to: 't@x.com', replies_enabled: true } } })
      render(<ChatWindow conversation={advisor} />)
      fireEvent.click(screen.getByLabelText('Email this message to me'))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/messages/m1/email-to-me', {}))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
        'Emailed to t@x.com — reply to that email to answer here'))
    })

    it('hides the action from everyone else', () => {
      authUser = { id: 'u1', role: 'advisor' }
      messagesState = { data: { messages: [received] }, isLoading: false, error: null, refetch: vi.fn() }
      render(<ChatWindow conversation={advisor} />)
      expect(screen.queryByLabelText('Email this message to me')).not.toBeInTheDocument()
    })
  })
})

/**
 * Ticket e6cc5fe5 (iCreate campus coordinator): "Can we make our drafts save
 * when we switch out of messages and then come back to it?" ChatWindow passes
 * the composer a draft key built from the signed-in user and the thread.
 */
describe('ChatWindow drafts (e6cc5fe5)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    authUser = { id: 'u1' }
    sendMutate.mockResolvedValue({})
    messagesState = { data: { messages: [] }, isLoading: false, error: null, refetch: vi.fn() }
  })

  const box = () => screen.getByPlaceholderText(/Message /)

  it('restores a half-written message when the thread opens again (e6cc5fe5)', () => {
    const first = render(<ChatWindow conversation={advisor} />)
    fireEvent.change(box(), { target: { value: 'Draft for Ada' } })
    first.unmount()
    render(<ChatWindow conversation={advisor} />)
    expect(box().value).toBe('Draft for Ada')
  })

  it('switching to another thread shows that thread\'s box, not this draft (e6cc5fe5)', () => {
    const view = render(<ChatWindow conversation={advisor} />)
    fireEvent.change(box(), { target: { value: 'Draft for Ada' } })
    view.rerender(<ChatWindow conversation={parentThread} />)
    expect(box().value).toBe('')
    view.rerender(<ChatWindow conversation={advisor} />)
    expect(box().value).toBe('Draft for Ada')
  })

  it('does not show the draft to a different signed-in user (e6cc5fe5)', () => {
    const first = render(<ChatWindow conversation={advisor} />)
    fireEvent.change(box(), { target: { value: 'Draft for Ada' } })
    first.unmount()
    authUser = { id: 'u2' }
    render(<ChatWindow conversation={advisor} />)
    expect(box().value).toBe('')
  })

  it('clears the draft after a successful send (e6cc5fe5)', async () => {
    render(<ChatWindow conversation={advisor} />)
    fireEvent.change(box(), { target: { value: 'Sent fine' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() => expect(sendMutate).toHaveBeenCalled())
    await waitFor(() => expect(window.localStorage.length).toBe(0))
  })

  it('keeps the draft when the send fails (e6cc5fe5)', async () => {
    sendMutate.mockRejectedValue(new Error('500'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = render(<ChatWindow conversation={advisor} />)
    fireEvent.change(box(), { target: { value: 'Did not go' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() => expect(box().value).toBe('Did not go'))
    first.unmount()
    render(<ChatWindow conversation={advisor} />)
    expect(box().value).toBe('Did not go')
  })
})
