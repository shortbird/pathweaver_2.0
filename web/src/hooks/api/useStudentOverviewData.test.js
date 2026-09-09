import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useStudentOverviewData } from './useStudentOverviewData'

const apiGet = vi.fn()
const oeaCredits = vi.fn()

vi.mock('../../services/api', () => ({
  default: { get: (...a) => apiGet(...a) },
  oeaAPI: { credits: (...a) => oeaCredits(...a) }
}))

const overview = {
  data: {
    student: { id: 'stu-1', first_name: 'Sam', last_name: 'Smith', avatar_url: null, created_at: '2025-01-01' },
    dashboard: { total_xp: 1200, xp_by_pillar: { stem: 1200 }, completed_tasks_count: 4, active_quests: [], recent_completions: [] },
    engagement: { calendar: [], rhythm: null, summary: null },
    completed_quests: [],
    subject_xp: { math: 6000 },
    pending_subject_xp: {},
    pillars_data: [],
    visibility_status: null
  }
}

describe('useStudentOverviewData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue(overview)
    oeaCredits.mockResolvedValue({ data: { enrollment: { id: 'e1' }, progress: null, is_oea_student: true } })
  })

  it('fetches the overview and attaches OEA progress', async () => {
    const { result } = renderHook(() => useStudentOverviewData('stu-1', '/api/parent/child-overview'))
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(apiGet).toHaveBeenCalledWith('/api/parent/child-overview/stu-1')
    expect(result.current.data.totalXp).toBe(1200)
    expect(result.current.data.subjectXp).toEqual({ math: 6000 })
    expect(result.current.data.oea.is_oea_student).toBe(true)
  })

  it('still loads the overview when the OEA fetch is forbidden', async () => {
    oeaCredits.mockRejectedValue({ response: { status: 403 } })
    const { result } = renderHook(() => useStudentOverviewData('stu-1', '/api/parent/child-overview'))
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data.oea).toBeNull()
    expect(result.current.data.user.first_name).toBe('Sam')
  })

  it('does nothing without a studentId', async () => {
    const { result } = renderHook(() => useStudentOverviewData(null, '/api/parent/child-overview'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(apiGet).not.toHaveBeenCalled()
  })
})
