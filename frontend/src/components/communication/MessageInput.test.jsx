import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MessageInput from './MessageInput'

describe('MessageInput', () => {
  it('sends on Enter and clears the input', () => {
    const onSend = vi.fn()
    render(<MessageInput onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'hi' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('hi')
    expect(input.value).toBe('')
  })

  it('does not send on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<MessageInput onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'multi' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send blank messages and shows the character count', () => {
    const onSend = vi.fn()
    render(<MessageInput onSendMessage={onSend} />)
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByText('3/2000')).toBeInTheDocument()
  })

  it('disables the input when disabled', () => {
    render(<MessageInput onSendMessage={vi.fn()} disabled />)
    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled()
  })
})
