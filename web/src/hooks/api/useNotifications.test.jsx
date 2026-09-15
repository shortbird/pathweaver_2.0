import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useNotificationsQuery, useNotificationsFeed, useNotificationActions } from './useNotifications'

/**
 * One cache for the bell and the page. Until 2026-09-15 each kept its own
 * local list, so a notification read on the page stayed bold in the bell
 * until its next poll, and dismissing one in the bell left it on the page.
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../services/supabaseClient', () => ({ supabase: {} }))

const ROWS = [
  { id: 'n1', title: 'A', is_read: false },
  { id: 'n2', title: 'B', is_read: true },
]

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { notifications: ROWS, unread_count: 1 } })
  api.put.mockResolvedValue({ data: {} })
  api.delete.mockResolvedValue({ data: {} })
})

describe('useNotifications', () => {
  it('the bell list and the page feed are patched together when one is read', async () => {
    const { wrapper } = harness()
    const { result } = renderHook(() => ({
      bell: useNotificationsQuery({ limit: 10 }),
      page: useNotificationsFeed({}),
      actions: useNotificationActions(),
    }), { wrapper })
    await waitFor(() => expect(result.current.page.notifications).toHaveLength(2))
    await waitFor(() => expect(result.current.bell.data?.unread_count).toBe(1))

    // The refetch after the write answers "all read" too, like the server would.
    api.get.mockResolvedValue({ data: { notifications: ROWS.map((n) => ({ ...n, is_read: true })), unread_count: 0 } })
    await act(async () => { await result.current.actions.markRead('n1') })

    expect(api.put).toHaveBeenCalledWith('/api/notifications/n1/read', {})
    await waitFor(() => {
      expect(result.current.bell.data.unread_count).toBe(0)
      expect(result.current.page.notifications.every((n) => n.is_read)).toBe(true)
    })
  })

  it('dismissing from one surface removes it from the other at once', async () => {
    const { wrapper } = harness()
    const { result } = renderHook(() => ({
      bell: useNotificationsQuery({ limit: 10 }),
      page: useNotificationsFeed({}),
      actions: useNotificationActions(),
    }), { wrapper })
    await waitFor(() => expect(result.current.page.notifications).toHaveLength(2))

    api.get.mockResolvedValue({ data: { notifications: [ROWS[1]], unread_count: 0 } })
    await act(async () => { await result.current.actions.dismiss('n1') })

    expect(api.delete).toHaveBeenCalledWith('/api/notifications/n1')
    await waitFor(() => {
      expect(result.current.bell.data.notifications.map((n) => n.id)).toEqual(['n2'])
      expect(result.current.page.notifications.map((n) => n.id)).toEqual(['n2'])
    })
  })

  it('the feed asks for the next page only while a full page came back', async () => {
    const { wrapper } = harness()
    const full = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, is_read: true }))
    api.get.mockResolvedValueOnce({ data: { notifications: full, unread_count: 0 } })
      .mockResolvedValueOnce({ data: { notifications: [{ id: 'last', is_read: true }], unread_count: 0 } })
    const { result } = renderHook(() => useNotificationsFeed({ unreadOnly: true }), { wrapper })
    await waitFor(() => expect(result.current.notifications).toHaveLength(20))
    expect(api.get).toHaveBeenCalledWith('/api/notifications?page=1&limit=20&unread_only=true')
    expect(result.current.hasMore).toBe(true)

    await act(async () => { await result.current.loadMore() })
    await waitFor(() => expect(result.current.notifications).toHaveLength(21))
    expect(api.get).toHaveBeenCalledWith('/api/notifications?page=2&limit=20&unread_only=true')
    expect(result.current.hasMore).toBe(false)
  })
})
