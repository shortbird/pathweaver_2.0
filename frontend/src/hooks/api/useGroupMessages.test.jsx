import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useGroups, useGroup, useGroupMessages, useAvailableMembers,
  useCreateGroup, useUpdateGroup, useAddMember, useRemoveMember,
  useLeaveGroup, useSendGroupMessage, useMarkGroupAsRead
} from './useGroupMessages'

const get = vi.fn()
const post = vi.fn()
const put = vi.fn()
const del = vi.fn()

vi.mock('../../services/api', () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), put: (...a) => put(...a), delete: (...a) => del(...a) }
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useGroupMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({ data: { ok: true } })
    post.mockResolvedValue({ data: { id: 'g1' } })
    put.mockResolvedValue({ data: { ok: true } })
    del.mockResolvedValue({ data: { ok: true } })
  })

  it('runs the group query hooks', async () => {
    const w = wrapper()
    renderHook(() => useGroups('u1'), { wrapper: w })
    renderHook(() => useGroup('g1'), { wrapper: w })
    renderHook(() => useGroupMessages('g1', 'u1'), { wrapper: w })
    renderHook(() => useAvailableMembers('g1'), { wrapper: w })
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/api/groups')
      expect(get).toHaveBeenCalledWith('/api/groups/g1')
      expect(get).toHaveBeenCalledWith('/api/groups/g1/messages')
      expect(get).toHaveBeenCalledWith('/api/groups/g1/available-members')
    })
  })

  it('runs the group mutations', async () => {
    const w = wrapper()
    const create = renderHook(() => useCreateGroup(), { wrapper: w })
    const update = renderHook(() => useUpdateGroup(), { wrapper: w })
    const addM = renderHook(() => useAddMember(), { wrapper: w })
    const rmM = renderHook(() => useRemoveMember(), { wrapper: w })
    const leave = renderHook(() => useLeaveGroup(), { wrapper: w })
    const sendMsg = renderHook(() => useSendGroupMessage(), { wrapper: w })
    const markRead = renderHook(() => useMarkGroupAsRead(), { wrapper: w })

    await act(async () => {
      await create.result.current.mutateAsync({ name: 'G', description: 'd', memberIds: ['m1'] })
      await update.result.current.mutateAsync({ groupId: 'g1', name: 'G2', description: 'd2' })
      await addM.result.current.mutateAsync({ groupId: 'g1', userId: 'm2' })
      await rmM.result.current.mutateAsync({ groupId: 'g1', userId: 'm2' })
      await sendMsg.result.current.mutateAsync({ groupId: 'g1', content: 'hi', currentUserId: 'u1' })
      await markRead.result.current.mutateAsync('g1')
      await leave.result.current.mutateAsync('g1')
    })

    expect(post).toHaveBeenCalledWith('/api/groups', expect.any(Object))
    expect(put).toHaveBeenCalledWith('/api/groups/g1', expect.any(Object))
    expect(post).toHaveBeenCalledWith('/api/groups/g1/members', expect.any(Object))
    expect(del).toHaveBeenCalledWith('/api/groups/g1/members/m2')
    expect(post).toHaveBeenCalledWith('/api/groups/g1/messages', expect.any(Object))
    expect(post).toHaveBeenCalledWith('/api/groups/g1/read', {})
    expect(post).toHaveBeenCalledWith('/api/groups/g1/leave', {})
  })
})
