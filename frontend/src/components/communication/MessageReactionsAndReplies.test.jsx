/**
 * Reaction toggle + reply flow for the messaging overhaul.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MessageThread from './MessageThread'
import MessageInput from './MessageInput'
import { ReactionsRow, MessageActionBar } from './MessageParts'

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

// jsdom doesn't implement scrollIntoView (used by the auto-scroll effect).
Element.prototype.scrollIntoView = vi.fn()

const baseMessage = {
  id: 'm1',
  sender_id: 'other',
  message_content: 'Hello there',
  created_at: '2025-01-01T10:00:00Z',
  reactions: [
    { emoji: '👍', count: 2, reacted: true },
    { emoji: '❤️', count: 1, reacted: false }
  ],
  reply_to: null,
  attachments: [],
  edited_at: null,
  is_deleted: false
}

describe('reaction toggle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders reaction pills with counts and highlights own reactions', () => {
    const onToggle = vi.fn()
    render(<ReactionsRow reactions={baseMessage.reactions} onToggle={onToggle} />)

    const thumbs = screen.getByRole('button', { name: '👍 2' })
    const heart = screen.getByRole('button', { name: '❤️ 1' })
    expect(thumbs).toHaveAttribute('aria-pressed', 'true')
    expect(thumbs.className).toContain('ring-optio-purple')
    expect(heart).toHaveAttribute('aria-pressed', 'false')
    expect(heart.className).not.toContain('ring-optio-purple')
  })

  it('clicking a pill toggles that reaction', () => {
    const onToggle = vi.fn()
    render(<ReactionsRow reactions={baseMessage.reactions} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: '👍 2' }))
    expect(onToggle).toHaveBeenCalledWith('👍')
  })

  it('the hover action bar opens the 6-emoji picker and reacts', () => {
    const onReact = vi.fn()
    render(
      <MessageActionBar isOwn={false} onReact={onReact} onReply={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
    // Exactly the 6 allowed emoji
    const options = screen.getAllByRole('button', { name: /React with/ })
    expect(options).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: 'React with 🎉' }))
    expect(onReact).toHaveBeenCalledWith('🎉')
  })

  it('MessageThread wires pill clicks to onToggleReaction with the message', () => {
    const onToggleReaction = vi.fn()
    render(
      <MessageThread
        messages={[baseMessage]}
        otherUser={{ id: 'other' }}
        isLoading={false}
        onToggleReaction={onToggleReaction}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '❤️ 1' }))
    expect(onToggleReaction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1' }),
      '❤️'
    )
  })
})

describe('reply flow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('MessageThread reply action passes the message to onReply', () => {
    const onReply = vi.fn()
    render(
      <MessageThread
        messages={[baseMessage]}
        otherUser={{ id: 'other' }}
        isLoading={false}
        onReply={onReply}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1' }))
  })

  it('MessageInput shows the reply banner and sends reply_to_message_id', () => {
    const onSend = vi.fn()
    const onCancel = vi.fn()
    render(
      <MessageInput
        onSendMessage={onSend}
        replyTo={{ id: 'm1', sender_name: 'Ada', content: 'Hello there' }}
        onCancelReply={onCancel}
      />
    )
    expect(screen.getByText(/Replying to/)).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'a reply' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('a reply', {
      attachments: [],
      replyToMessageId: 'm1'
    })
  })

  it('the reply banner X cancels the reply', () => {
    const onCancel = vi.fn()
    render(
      <MessageInput
        onSendMessage={vi.fn()}
        replyTo={{ id: 'm1', sender_name: 'Ada', content: 'Hello there' }}
        onCancelReply={onCancel}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders a quoted reply block above a message that replies to another', () => {
    const replyMessage = {
      ...baseMessage,
      id: 'm2',
      message_content: 'Replying back',
      reply_to: { id: 'm1', sender_name: 'Ada', content: 'Hello there' }
    }
    render(
      <MessageThread
        messages={[replyMessage]}
        otherUser={{ id: 'other' }}
        isLoading={false}
      />
    )
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Replying back')).toBeInTheDocument()
  })

  it('deleted messages render as a tombstone without reactions', () => {
    const deleted = { ...baseMessage, is_deleted: true, message_content: '', reactions: [], attachments: [] }
    render(
      <MessageThread messages={[deleted]} otherUser={{ id: 'other' }} isLoading={false} />
    )
    expect(screen.getByText('Message deleted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '👍 2' })).not.toBeInTheDocument()
  })
})
