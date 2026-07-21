import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useQuests, useQuestDetail, useActiveQuests, useCompletedQuests, useQuestTasks,
  useQuestProgress, useQuestEngagement, useStudentQuestEngagement, useGlobalEngagement,
  useStudentEngagement, useEnrollQuest, useCompleteTask, useAbandonQuest,
  useDeleteEnrollment, useEndQuest
} from './useQuests'

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()

vi.mock('../../services/api', () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), delete: (...a) => del(...a) }
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useQuests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({ data: { ok: true } })
    post.mockResolvedValue({ data: { message: 'ok' } })
    del.mockResolvedValue({ data: { message: 'ok' } })
  })

  it('runs the quest query hooks', async () => {
    const w = wrapper()
    renderHook(() => useQuests({}), { wrapper: w })
    renderHook(() => useQuestDetail('q1'), { wrapper: w })
    renderHook(() => useActiveQuests('u1'), { wrapper: w })
    renderHook(() => useCompletedQuests('u1'), { wrapper: w })
    renderHook(() => useQuestTasks('q1'), { wrapper: w })
    renderHook(() => useQuestProgress('u1', 'q1'), { wrapper: w })
    renderHook(() => useQuestEngagement('q1'), { wrapper: w })
    renderHook(() => useStudentQuestEngagement('s1', 'q1'), { wrapper: w })
    renderHook(() => useGlobalEngagement(), { wrapper: w })
    renderHook(() => useStudentEngagement('s1'), { wrapper: w })
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/api/quests/q1')
      expect(get).toHaveBeenCalledWith('/api/users/dashboard')
      expect(get).toHaveBeenCalledWith('/api/quests/q1/tasks')
      expect(get).toHaveBeenCalledWith('/api/quests/q1/engagement')
      expect(get).toHaveBeenCalledWith('/api/users/me/engagement')
    })
  })

  it('runs the quest mutations', async () => {
    const w = wrapper()
    const enroll = renderHook(() => useEnrollQuest(), { wrapper: w })
    const complete = renderHook(() => useCompleteTask(), { wrapper: w })
    const abandon = renderHook(() => useAbandonQuest(), { wrapper: w })
    const delEnr = renderHook(() => useDeleteEnrollment(), { wrapper: w })
    const end = renderHook(() => useEndQuest(), { wrapper: w })

    await act(async () => {
      await enroll.result.current.mutateAsync({ questId: 'q1', options: {} })
      await complete.result.current.mutateAsync({ taskId: 't1', evidence: { text: 'x' }, userId: 'u1' })
      await abandon.result.current.mutateAsync('q1')
      await delEnr.result.current.mutateAsync({ questId: 'q1' })
      await end.result.current.mutateAsync('q1')
    })

    expect(post).toHaveBeenCalledWith('/api/quests/q1/enroll', {})
    expect(post).toHaveBeenCalledWith('/api/tasks/t1/complete', { text: 'x' })
    expect(post).toHaveBeenCalledWith('/api/quests/q1/abandon', {})
    expect(del).toHaveBeenCalled()
    expect(post).toHaveBeenCalledWith('/api/quests/q1/end', {})
  })
})
