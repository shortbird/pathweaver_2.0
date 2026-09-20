/**
 * The steps calls name the child when a parent is in the family scope.
 *
 * Sara Cartwright, 2026-09-19: on Ella's quest she clicked Break It Down and
 * the request went out as her own. The backend scopes steps by the student
 * the request names, so without `student_id` a parent's click looks for a
 * task she does not own (OPTIO-WEB 7741782549). Reads and the delete carry it
 * in the query string; the posts carry it in the body, the same split as
 * evidenceDocumentService. Without a scope nothing is added, so a student's
 * own calls are byte-for-byte what they were.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import api, { taskStepsAPI } from './api'

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))
vi.mock('../utils/browserDetection', () => ({ shouldUseAuthHeaders: () => false }))
vi.mock('./sentry', () => ({ captureException: vi.fn() }))

const CHILD = 'child-1'

describe('taskStepsAPI in the family scope', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: {} })
    vi.spyOn(api, 'post').mockResolvedValue({ data: {} })
    vi.spyOn(api, 'put').mockResolvedValue({ data: {} })
    vi.spyOn(api, 'delete').mockResolvedValue({ data: {} })
  })

  it('reads and the delete put student_id in the query string', async () => {
    await taskStepsAPI.getSteps('t1', { studentId: CHILD })
    await taskStepsAPI.deleteSteps('t1', { studentId: CHILD })
    expect(api.get).toHaveBeenCalledWith('/api/tasks/t1/steps', { params: { student_id: CHILD } })
    expect(api.delete).toHaveBeenCalledWith('/api/tasks/t1/steps', { params: { student_id: CHILD } })
  })

  it('the posts and the toggle put student_id in the body', async () => {
    await taskStepsAPI.generateSteps('t1', 'detailed', { studentId: CHILD })
    await taskStepsAPI.drillDown('t1', 's1', { studentId: CHILD })
    await taskStepsAPI.toggleStep('t1', 's1', { studentId: CHILD })
    expect(api.post).toHaveBeenCalledWith('/api/tasks/t1/steps/generate',
      { granularity: 'detailed', student_id: CHILD })
    expect(api.post).toHaveBeenCalledWith('/api/tasks/t1/steps/s1/drill-down', { student_id: CHILD })
    expect(api.put).toHaveBeenCalledWith('/api/tasks/t1/steps/s1/toggle', { student_id: CHILD })
  })

  it('a student on their own task sends exactly what they always did', async () => {
    await taskStepsAPI.getSteps('t1')
    await taskStepsAPI.generateSteps('t1')
    await taskStepsAPI.toggleStep('t1', 's1')
    expect(api.get).toHaveBeenCalledWith('/api/tasks/t1/steps', { params: {} })
    expect(api.post).toHaveBeenCalledWith('/api/tasks/t1/steps/generate', { granularity: 'quick' })
    expect(api.put).toHaveBeenCalledWith('/api/tasks/t1/steps/s1/toggle', {})
  })
})
