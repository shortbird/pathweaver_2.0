/**
 * The scroll rules every thread shares. What used to happen: any change to the
 * messages array -- a poll, a reaction, a re-signed attachment URL -- scrolled
 * the reader to the bottom.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import MessageThread from './MessageThread'

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

const msg = (id, sender = 'other') => ({
  id, sender_id: sender, message_content: `message ${id}`, created_at: '2025-01-01T10:00:00Z', reactions: []
})

// jsdom lays nothing out, so the scroller's geometry is set by hand: 1000px
// of content in a 300px window, scrolled to `top`.
const layOut = (el, top) => {
  Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true })
  el.scrollTop = top
  fireEvent.scroll(el)
}

const renderThread = (messages, threadKey = 't1') => {
  const utils = render(
    <MessageThread messages={messages} otherUser={{ id: 'other' }} isLoading={false} threadKey={threadKey} />
  )
  const scroller = utils.container.querySelector('.overflow-y-auto')
  return { ...utils, scroller }
}

describe('useThreadScroll', () => {
  it('lands at the bottom when a thread opens', () => {
    const { scroller } = renderThread([msg('a'), msg('b')])
    // scrollHeight is 0 in jsdom until laid out; the jump still set scrollTop
    // to it, which is what "the bottom" means to the element.
    expect(scroller.scrollTop).toBe(scroller.scrollHeight)
  })

  it('does not move a reader who scrolled up when the array changes underneath them', () => {
    const messages = [msg('a'), msg('b')]
    const { scroller, rerender } = renderThread(messages)
    layOut(scroller, 100)

    // A reaction, an edit, a poll: same messages, new array.
    const reacted = messages.map((m) => (m.id === 'a' ? { ...m, reactions: [{ emoji: '👍', count: 1 }] } : m))
    rerender(<MessageThread messages={reacted} otherUser={{ id: 'other' }} isLoading={false} threadKey="t1" />)
    expect(scroller.scrollTop).toBe(100)

    // Someone else's new message, while reading older ones: still put.
    rerender(<MessageThread messages={[...reacted, msg('c')]} otherUser={{ id: 'other' }} isLoading={false} threadKey="t1" />)
    expect(scroller.scrollTop).toBe(100)
  })

  it('follows a new message when the reader was already at the bottom', () => {
    const messages = [msg('a'), msg('b')]
    const { scroller, rerender } = renderThread(messages)
    scroller.scrollTo = vi.fn()
    layOut(scroller, 700)

    rerender(<MessageThread messages={[...messages, msg('c')]} otherUser={{ id: 'other' }} isLoading={false} threadKey="t1" />)
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' })
  })

  it('follows the reader\'s own message wherever they were', () => {
    const messages = [msg('a'), msg('b')]
    const { scroller, rerender } = renderThread(messages)
    scroller.scrollTo = vi.fn()
    layOut(scroller, 100)

    rerender(<MessageThread messages={[...messages, msg('c', 'me')]} otherUser={{ id: 'other' }} isLoading={false} threadKey="t1" />)
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' })
  })

  it('jumps to the bottom of a different thread', () => {
    const { scroller, rerender } = renderThread([msg('a'), msg('b')])
    layOut(scroller, 100)
    rerender(<MessageThread messages={[msg('x'), msg('y')]} otherUser={{ id: 'other' }} isLoading={false} threadKey="t2" />)
    expect(scroller.scrollTop).toBe(1000)
  })
})
