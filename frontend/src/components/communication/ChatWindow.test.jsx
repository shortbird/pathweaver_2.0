import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ChatWindow from './ChatWindow'

let messagesState = { data: { messages: [] }, isLoading: false, error: null, refetch: vi.fn() }
const sendMutate = vi.fn().mockResolvedValue({})

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../hooks/api/useDirectMessages', () => ({
  useConversationMessages: () => messagesState,
  useSendMessage: () => ({ mutateAsync: sendMutate, isPending: false }),
  useMarkAsRead: () => ({ mutate: vi.fn() })
}))

const advisor = { id: 'c1', type: 'advisor', other_user: { id: 'a1', first_name: 'Ada', last_name: 'Lovelace' } }
const support = { id: 'sup', type: 'support', other_user: { id: 'sup', display_name: 'Optio Support' } }

describe('ChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('shows an error state with a retry when messages fail to load', () => {
    const refetch = vi.fn()
    messagesState = { data: null, isLoading: false, error: new Error('boom'), refetch }
    render(<ChatWindow conversation={advisor} />)
    expect(screen.getByText("Couldn't load messages")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(refetch).toHaveBeenCalled()
  })
})
