import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useConversations, useConversationMessages, useUnreadCount, useCanMessage,
  useMessagingContacts, useSendMessage, useMarkAsRead
} from './useDirectMessages'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const toastError = vi.fn()

vi.mock('../../services/api', () => ({ default: { get: (...a) => get(...a), post: (...a) => post(...a), put: (...a) => put(...a) } }))
vi.mock('react-hot-toast', () => ({ default: { error: (...a) => toastError(...a) } }))

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useDirectMessages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches conversations, messages, unread count, can-message and contacts', async () => {
    get.mockImplementation((url) => {
      if (url.endsWith('/conversations')) return Promise.resolve({ data: { data: { conversations: [{ id: 'c1' }] } } })
      if (url.includes('/conversations/')) return Promise.resolve({ data: { messages: [{ id: 'm1' }] } })
      if (url.endsWith('/unread-count')) return Promise.resolve({ data: { count: 3 } })
      if (url.includes('/can-message/')) return Promise.resolve({ data: { can_message: true } })
      if (url.endsWith('/contacts')) return Promise.resolve({ data: { data: { contacts: [{ id: 'a1' }] } } })
      return Promise.resolve({ data: {} })
    })
    const w = wrapper()
    const convos = renderHook(() => useConversations('u1'), { wrapper: w })
    const msgs = renderHook(() => useConversationMessages('c1', 'u1'), { wrapper: w })
    const unread = renderHook(() => useUnreadCount('u1'), { wrapper: w })
    const can = renderHook(() => useCanMessage('t1'), { wrapper: w })
    const contacts = renderHook(() => useMessagingContacts('u1'), { wrapper: w })

    await waitFor(() => expect(convos.result.current.data).toEqual({ conversations: [{ id: 'c1' }] }))
    await waitFor(() => expect(msgs.result.current.data).toEqual({ messages: [{ id: 'm1' }] }))
    await waitFor(() => expect(unread.result.current.data).toEqual({ count: 3 }))
    await waitFor(() => expect(can.result.current.data).toEqual({ can_message: true }))
    await waitFor(() => expect(contacts.result.current.data).toEqual({ contacts: [{ id: 'a1' }] }))
  })

  it('sends a message (optimistic) and marks as read', async () => {
    post.mockResolvedValue({ data: { id: 'm2' } })
    put.mockResolvedValue({ data: { ok: true } })
    const w = wrapper()
    const send = renderHook(() => useSendMessage(), { wrapper: w })
    await act(async () => {
      await send.result.current.mutateAsync({ targetUserId: 't1', content: 'hi', currentUserId: 'u1' })
    })
    expect(post).toHaveBeenCalledWith('/api/messages/conversations/t1/send', { content: 'hi' })

    const read = renderHook(() => useMarkAsRead(), { wrapper: w })
    await act(async () => { await read.result.current.mutateAsync('m1') })
    expect(put).toHaveBeenCalledWith('/api/messages/m1/read', {})
  })

  it('toasts and rolls back when sending fails', async () => {
    post.mockRejectedValue({ response: { data: { error: 'nope' } } })
    const w = wrapper()
    const send = renderHook(() => useSendMessage(), { wrapper: w })
    await act(async () => {
      try { await send.result.current.mutateAsync({ targetUserId: 't1', content: 'hi', currentUserId: 'u1' }) } catch { /* expected */ }
    })
    expect(toastError).toHaveBeenCalledWith('nope')
  })
})
