import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// The family scope the hooks read (contexts/FamilyScopeContext). Unscoped by
// default; the scoped describe below selects a child.
const scopeState = { selectedChildId: null, selectedChild: null }
vi.mock('../../contexts/FamilyScopeContext', () => ({
  useFamilyScope: () => scopeState,
}))

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
    // Every student-scoped read carries the family scope as `params` --
    // empty here, because no child is selected (hooks/useStudentScope).
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/api/quests/q1', { params: {} })
      expect(get).toHaveBeenCalledWith('/api/users/dashboard', { params: {} })
      expect(get).toHaveBeenCalledWith('/api/quests/q1/tasks', { params: {} })
      expect(get).toHaveBeenCalledWith('/api/quests/q1/engagement', { params: {} })
      expect(get).toHaveBeenCalledWith('/api/users/me/engagement', { params: {} })
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

describe('useQuests in family scope', () => {
  // A parent working on a child's account: the same hooks, the same URLs,
  // with the child named on every read and write.
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({ data: { ok: true } })
    post.mockResolvedValue({ data: { message: 'ok' } })
    scopeState.selectedChildId = 'kid-1'
    scopeState.selectedChild = { id: 'kid-1', firstName: 'Romney' }
  })

  afterEach(() => {
    scopeState.selectedChildId = null
    scopeState.selectedChild = null
  })

  it('reads the child\'s rows from the student routes', async () => {
    const w = wrapper()
    renderHook(() => useQuestDetail('q1'), { wrapper: w })
    renderHook(() => useGlobalEngagement(), { wrapper: w })
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/api/quests/q1', { params: { student_id: 'kid-1' } })
      expect(get).toHaveBeenCalledWith('/api/users/me/engagement', { params: { student_id: 'kid-1' } })
    })
  })

  it('keys the cache by child so switching children never serves the previous one', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const w = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    renderHook(() => useQuestDetail('q1'), { wrapper: w })
    const keys = client.getQueryCache().getAll().map((q) => q.queryKey)
    expect(keys).toContainEqual(['quests', 'detail', 'q1', 'kid-1'])
  })

  it('writes name the child too', async () => {
    const w = wrapper()
    const enroll = renderHook(() => useEnrollQuest(), { wrapper: w })
    const complete = renderHook(() => useCompleteTask(), { wrapper: w })
    const end = renderHook(() => useEndQuest(), { wrapper: w })
    await act(async () => {
      await enroll.result.current.mutateAsync({ questId: 'q1', options: { force_new: true } })
      await complete.result.current.mutateAsync({ taskId: 't1', evidence: { text: 'x' }, userId: 'kid-1' })
      await end.result.current.mutateAsync('q1')
    })
    expect(post).toHaveBeenCalledWith('/api/quests/q1/enroll', { student_id: 'kid-1', force_new: true })
    expect(post).toHaveBeenCalledWith('/api/tasks/t1/complete', { student_id: 'kid-1', text: 'x' })
    expect(post).toHaveBeenCalledWith('/api/quests/q1/end', { student_id: 'kid-1' })
  })

  it('appends the child to a multipart completion', async () => {
    const w = wrapper()
    const complete = renderHook(() => useCompleteTask(), { wrapper: w })
    const form = new FormData()
    form.append('evidence_type', 'text')
    await act(async () => {
      await complete.result.current.mutateAsync({ taskId: 't1', evidence: form, userId: 'kid-1' })
    })
    const sent = post.mock.calls.find(([url]) => url === '/api/tasks/t1/complete')[1]
    expect(sent.get('student_id')).toBe('kid-1')
  })
})
