/**
 * The one bubble every thread renders. What is pinned here is the contract
 * the surfaces (DMs, group chats, the SIS inbox) rely on, not the look.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MessageBubble, { OWN_BUBBLE_CLASS } from './MessageBubble'
import { MessageActionBar, MessageRow, ACTION_BAR_PX } from './MessageParts'

const message = {
  id: 'm1',
  sender_id: 'u1',
  message_content: 'See https://docs.acme.com/form for the details',
  created_at: '2025-01-01T10:00:00Z',
  attachments: [{ url: 'https://files/x.pdf', type: 'file', name: 'x.pdf', size: 2048 }]
}

describe('MessageBubble', () => {
  // 9b46c748 (iCreate, 2026-09-23): "add read receipts" -- and say when.
  it('says when an own message was seen, given the read time', () => {
    const now = new Date()
    render(<MessageBubble message={message} isOwn seen={now.toISOString()} />)
    expect(screen.getByText(/· Seen \d{1,2}:\d{2}/)).toBeInTheDocument()
  })

  it('says how many of a group have read past a message, names on hover', () => {
    render(<MessageBubble message={message} isOwn seenBy={['Ada L', 'Sam P']} />)
    const seen = screen.getByText('· Seen by 2')
    expect(seen).toHaveAttribute('title', 'Ada L, Sam P')
  })

  it('shows who wrote a school message the family was told about', () => {
    render(<MessageBubble message={{ ...message, sender_label: 'Tam T for iCreate' }} />)
    expect(screen.getByText('Tam T for iCreate')).toBeInTheDocument()
  })

  it('puts an own message on the brand tint with dark text, not the gradient', () => {
    render(<MessageBubble message={message} isOwn />)
    const bubble = screen.getByText(/See/).closest('div')
    expect(bubble.className).toContain('bg-optio-purple/10')
    expect(bubble.className).toContain('text-gray-900')
    expect(bubble.className).not.toContain('gradient')
    expect(OWN_BUBBLE_CLASS).not.toContain('text-white')
  })

  it('puts everyone else on white', () => {
    render(<MessageBubble message={message} isOwn={false} />)
    const bubble = screen.getByText(/See/).closest('div')
    expect(bubble.className).toContain('bg-white')
  })

  it('renders links, attachments, the timestamp, the read receipt and any surface-specific meta', () => {
    render(<MessageBubble message={message} isOwn seen meta=" · Sent by Kate" />)
    expect(screen.getByRole('link', { name: 'https://docs.acme.com/form' }))
      .toHaveAttribute('href', 'https://docs.acme.com/form')
    expect(screen.getByRole('link', { name: /x\.pdf/ })).toHaveTextContent('2 KB')
    expect(screen.getByText(/· Seen · Sent by Kate/)).toBeInTheDocument()
  })

  it('says nothing about reading until told to', () => {
    render(<MessageBubble message={{ ...message, read_at: '2025-01-01T11:00:00Z' }} isOwn />)
    expect(screen.queryByText(/Seen/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Read/)).not.toBeInTheDocument()
  })

  it('shows a deleted message as a placeholder, and an edited one as edited', () => {
    const { rerender } = render(<MessageBubble message={{ ...message, is_deleted: true }} />)
    expect(screen.getByText('Message deleted')).toBeInTheDocument()
    expect(screen.queryByText(/See/)).not.toBeInTheDocument()

    rerender(<MessageBubble message={{ ...message, edited_at: '2025-01-01T11:00:00Z' }} />)
    expect(screen.getByText('(edited)')).toBeInTheDocument()
  })
})

describe('MessageActionBar placement', () => {
  // The bar used to float over the bubble's top edge and hide the first line
  // of text. It is in the flow now, above the bubble, in a slot that is 0px
  // until the row is hovered or focused.
  it('is a closed slot until opened, then a bar-height slot with the bounce', () => {
    const { rerender } = render(<MessageActionBar isOwn />)
    let bar = screen.getByTestId('message-action-bar')
    expect(bar.style.height).toBe('0px')
    expect(bar.dataset.open).toBe('false')

    rerender(<MessageActionBar isOwn open />)
    bar = screen.getByTestId('message-action-bar')
    expect(bar.style.height).toBe(`${ACTION_BAR_PX}px`)
    expect(bar.firstChild.className).toContain('animate-bar-bounce')
  })

  it('stays open while its emoji picker is up, and tells the row so', () => {
    const onHold = vi.fn()
    render(<MessageActionBar isOwn={false} onHold={onHold} onReact={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
    expect(onHold).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('message-action-bar').dataset.open).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'React with 🎉' }))
    expect(onHold).toHaveBeenLastCalledWith(false)
  })
})

describe('MessageRow', () => {
  // Opening the slot grows the row at its top. The scroller moves by the same
  // amount in the same commit, so the hovered bubble stays under the cursor
  // and the messages above it slide up to make the room.
  it('moves the scroller by the bar height so the hovered bubble stays put', () => {
    const { container } = render(
      <div className="overflow-y-auto">
        <MessageRow isOwn>{(open) => <div data-testid="bubble">{open ? 'open' : 'closed'}</div>}</MessageRow>
      </div>
    )
    const scroller = container.firstChild
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true })
    scroller.scrollTop = 100
    const row = screen.getByTestId('bubble').parentElement

    fireEvent.mouseEnter(row)
    expect(screen.getByTestId('bubble')).toHaveTextContent('open')
    expect(scroller.scrollTop).toBe(100 + ACTION_BAR_PX)

    fireEvent.mouseLeave(row)
    expect(screen.getByTestId('bubble')).toHaveTextContent('closed')
    expect(scroller.scrollTop).toBe(100)
  })
})
