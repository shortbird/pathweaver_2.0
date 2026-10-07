import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useQuests, useQuestDetail, useActiveQuests, useCompletedQuests, useQuestTasks,
  useQuestProgress, useQuestEngagement, useStudentQuestEngagement, useGlobalEngagement,
  useStudentEngagement, useEnrollQuest, useCompleteTask, useAbandonQuest,
  useDeleteEnrollment, useEndQuest, useArchiveEnrollment, useUnarchiveEnrollment
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

/**
 * Save for later, and Resume, in and out of the family scope.
 *
 * Ticket e17134c6-4d17-432d-a075-4e6e89174282 (iCreate org admin): "I didn't
 * dare select that because I was worried I might end the quest on accident
 * and I didn't know what would happen." The quest page's End button became
 * "Save for later" (POST /archive) and "Mark done" (POST /end). A parent on a
 * child's quest must save the CHILD's quest; before, /archive could only
 * ever touch the caller's own row.
 */
describe('Save for later (archive) and Resume (unarchive)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    post.mockResolvedValue({ data: { success: true } })
  })

  afterEach(() => {
    scopeState.selectedChildId = null
    scopeState.selectedChild = null
  })

  it('saves the caller\'s own quest when no child is named', async () => {
    const archive = renderHook(() => useArchiveEnrollment(), { wrapper: wrapper() })
    await act(async () => { await archive.result.current.mutateAsync({ questId: 'q1' }) })
    expect(post).toHaveBeenCalledWith('/api/quests/q1/archive', { reason: undefined, feedback: undefined })
  })

  it('names the child the quest page passes', async () => {
    const archive = renderHook(() => useArchiveEnrollment(), { wrapper: wrapper() })
    await act(async () => {
      await archive.result.current.mutateAsync({ questId: 'q1', studentId: 'kid-1' })
    })
    expect(post).toHaveBeenCalledWith('/api/quests/q1/archive',
      { reason: undefined, feedback: undefined, student_id: 'kid-1' })
  })

  // The role homes' own quest cards archive the signed-in user's quest even
  // while a child is picked (QuestCardSimple ownOnly), so the hook never
  // reads the scope on its own.
  it('never takes the child from the family scope by itself', async () => {
    scopeState.selectedChildId = 'kid-1'
    const archive = renderHook(() => useArchiveEnrollment(), { wrapper: wrapper() })
    await act(async () => { await archive.result.current.mutateAsync({ questId: 'q1' }) })
    expect(post.mock.calls[0][1]).not.toHaveProperty('student_id')
  })

  it('resumes the child\'s quest from the child\'s Saved for Later list', async () => {
    scopeState.selectedChildId = 'kid-1'
    const resume = renderHook(() => useUnarchiveEnrollment(), { wrapper: wrapper() })
    await act(async () => { await resume.result.current.mutateAsync({ questId: 'q1' }) })
    expect(post).toHaveBeenCalledWith('/api/quests/q1/unarchive', { student_id: 'kid-1' })
  })
})
