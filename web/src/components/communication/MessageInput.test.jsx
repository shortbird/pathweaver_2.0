import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MessageInput from './MessageInput'

vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

describe('MessageInput', () => {
  // Ticket e937883a: Enter used to send, and staff lost half-written replies
  // every time they pressed Enter for a new paragraph. The owner's decision:
  // Ctrl/Cmd+Enter sends on the web, plain Enter is a new line (as on mobile).
  it('sends on Ctrl+Enter and clears the input (e937883a)', () => {
    const onSend = vi.fn()
    render(<MessageInput onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'hi' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(onSend).toHaveBeenCalledWith('hi', { attachments: [], replyToMessageId: null })
    expect(input.value).toBe('')
  })

  it('sends on Cmd+Enter (e937883a)', () => {
    const onSend = vi.fn()
    render(<MessageInput onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'hi' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('does not send on plain Enter: it is a new paragraph (e937883a)', () => {
    const onSend = vi.fn()
    render(<MessageInput onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'first paragraph' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(input.value).toBe('first paragraph')
  })

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<MessageInput onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'multi' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows the Ctrl+Enter hint, not Enter (e937883a)', () => {
    render(<MessageInput onSendMessage={vi.fn()} />)
    expect(screen.getByText(/(Ctrl|\u2318)\+Enter to send/)).toBeInTheDocument()
  })

  it('does not send blank messages and shows the character count', () => {
    const onSend = vi.fn()
    render(<MessageInput onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByText('3/2000')).toBeInTheDocument()
  })

  it('disables the input when disabled', () => {
    render(<MessageInput onSendMessage={vi.fn()} disabled />)
    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled()
  })
})
