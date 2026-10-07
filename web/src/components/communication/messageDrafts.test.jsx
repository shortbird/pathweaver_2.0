import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MessageInput from './MessageInput'
import { messageDraftKey, readDraft, writeDraft } from './messageDrafts'

vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

/**
 * Ticket e6cc5fe5 (iCreate campus coordinator, SIS /inbox): "Can we make our
 * drafts save when we switch out of messages and then come back to it?"
 *
 * The composer keeps the unsent text per (signed-in user, thread) in
 * localStorage, restores it when that thread opens again, and drops it only
 * once a send succeeds.
 */
const keyA = messageDraftKey('user-1', 'dm:thread-a')
const keyB = messageDraftKey('user-1', 'dm:thread-b')
const keyOtherUser = messageDraftKey('user-2', 'dm:thread-a')

const box = () => screen.getByPlaceholderText('Type a message...')
const type = (value) => fireEvent.change(box(), { target: { value } })
const send = () => fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true })

describe('MessageInput drafts (e6cc5fe5)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keys a draft by user and thread, and keeps none without both (e6cc5fe5)', () => {
    expect(keyA).toBe('optio:message-draft:user-1:dm:thread-a')
    expect(messageDraftKey(null, 'dm:x')).toBeNull()
    expect(messageDraftKey('user-1', null)).toBeNull()
  })

  it('restores the text after the thread unmounts and opens again (e6cc5fe5)', () => {
    const first = render(<MessageInput onSendMessage={vi.fn()} draftKey={keyA} />)
    type('Half a reply to Molly')
    first.unmount()

    render(<MessageInput onSendMessage={vi.fn()} draftKey={keyA} />)
    expect(box().value).toBe('Half a reply to Molly')
  })

  it('does not show one thread\'s draft in a different thread (e6cc5fe5)', () => {
    const first = render(<MessageInput onSendMessage={vi.fn()} draftKey={keyA} />)
    type('For thread A only')
    first.unmount()

    render(<MessageInput onSendMessage={vi.fn()} draftKey={keyB} />)
    expect(box().value).toBe('')
  })

  it('loads the new thread\'s draft when the key changes without a remount (e6cc5fe5)', () => {
    writeDraft(keyB, 'Waiting in B')
    const view = render(<MessageInput onSendMessage={vi.fn()} draftKey={keyA} />)
    type('Typed in A')
    view.rerender(<MessageInput onSendMessage={vi.fn()} draftKey={keyB} />)
    expect(box().value).toBe('Waiting in B')
    view.rerender(<MessageInput onSendMessage={vi.fn()} draftKey={keyA} />)
    expect(box().value).toBe('Typed in A')
  })

  it('does not show one user\'s draft to a different user on the same browser (e6cc5fe5)', () => {
    const first = render(<MessageInput onSendMessage={vi.fn()} draftKey={keyA} />)
    type('Private to user 1')
    first.unmount()

    render(<MessageInput onSendMessage={vi.fn()} draftKey={keyOtherUser} />)
    expect(box().value).toBe('')
  })

  it('clears the draft once the send succeeds (e6cc5fe5)', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    const first = render(<MessageInput onSendMessage={onSend} draftKey={keyA} />)
    type('Sending this')
    send()
    expect(onSend).toHaveBeenCalledWith('Sending this', expect.any(Object))
    await waitFor(() => expect(window.localStorage.getItem(keyA)).toBeNull())
    first.unmount()

    render(<MessageInput onSendMessage={onSend} draftKey={keyA} />)
    expect(box().value).toBe('')
  })

  it('keeps the draft and puts the text back when the send fails (e6cc5fe5)', async () => {
    const onSend = vi.fn().mockResolvedValue(false)
    const first = render(<MessageInput onSendMessage={onSend} draftKey={keyA} />)
    type('This one will fail')
    send()
    await waitFor(() => expect(box().value).toBe('This one will fail'))
    expect(readDraft(keyA)).toBe('This one will fail')
    first.unmount()

    render(<MessageInput onSendMessage={onSend} draftKey={keyA} />)
    expect(box().value).toBe('This one will fail')
  })

  it('keeps the draft when the send rejects (e6cc5fe5)', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('network'))
    render(<MessageInput onSendMessage={onSend} draftKey={keyA} />)
    type('Rejected send')
    send()
    await waitFor(() => expect(box().value).toBe('Rejected send'))
    expect(readDraft(keyA)).toBe('Rejected send')
  })

  it('does not clear text typed while an earlier send was in flight (e6cc5fe5)', async () => {
    let finish
    const onSend = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    render(<MessageInput onSendMessage={onSend} draftKey={keyA} />)
    type('First message')
    send()
    type('Second, still writing')
    finish(undefined)
    await new Promise((r) => setTimeout(r, 0))
    expect(readDraft(keyA)).toBe('Second, still writing')
  })

  it('does not store an empty draft, and removes the key when the box is emptied (e6cc5fe5)', () => {
    render(<MessageInput onSendMessage={vi.fn()} draftKey={keyA} />)
    type('   ')
    expect(window.localStorage.getItem(keyA)).toBeNull()
    type('something')
    expect(window.localStorage.getItem(keyA)).toBe('something')
    type('')
    expect(window.localStorage.getItem(keyA)).toBeNull()
  })

  it('still lets people type and send when storage throws (e6cc5fe5)', async () => {
    const boom = () => { throw new Error('SecurityError: storage blocked') }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)

    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<MessageInput onSendMessage={onSend} draftKey={keyA} />)
    type('Typed anyway')
    expect(box().value).toBe('Typed anyway')
    send()
    expect(onSend).toHaveBeenCalledWith('Typed anyway', expect.any(Object))
    expect(box().value).toBe('')
    // Let the success handler run against the throwing storage.
    await new Promise((r) => setTimeout(r, 0))
    expect(box().value).toBe('')
  })

  it('keeps nothing when no draftKey is given (e6cc5fe5)', () => {
    const first = render(<MessageInput onSendMessage={vi.fn()} />)
    type('Not kept')
    first.unmount()
    expect(window.localStorage.length).toBe(0)
  })
})
