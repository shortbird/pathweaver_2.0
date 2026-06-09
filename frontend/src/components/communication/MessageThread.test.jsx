import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MessageThread from './MessageThread'

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

// jsdom doesn't implement scrollIntoView (used by the auto-scroll effect).
Element.prototype.scrollIntoView = vi.fn()

const messages = [
  { id: 'm1', sender_id: 'u1', message_content: 'Hello there', read_at: 't', created_at: '2025-01-01T10:00:00Z' },
  { id: 'm2', sender_id: 'other', message_content: 'Hi back', read_at: null, created_at: '2025-01-01T10:01:00Z' }
]

describe('MessageThread', () => {
  it('renders sent and received messages', () => {
    render(<MessageThread messages={messages} otherUser={{ id: 'other' }} isLoading={false} />)
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Hi back')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    const { container } = render(<MessageThread messages={[]} otherUser={{ id: 'other' }} isLoading />)
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('renders with no messages', () => {
    render(<MessageThread messages={[]} otherUser={{ id: 'other' }} isLoading={false} />)
    expect(screen.queryByText('Hello there')).not.toBeInTheDocument()
  })
})
