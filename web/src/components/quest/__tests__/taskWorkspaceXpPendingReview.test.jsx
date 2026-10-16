/**
 * Ticket 536a3018, Jackie Hill (Arete Academy): "have the xp not be awarded
 * until it's approved". When the school holds a task's XP for a teacher's
 * accept, the completion answers xp_pending_review: true and xp_awarded: 0.
 * The student is told the XP comes when the teacher accepts, and nothing is
 * reported as earned. Without the hold the message is what it always was.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TaskWorkspace from '../TaskWorkspace'
import { evidenceDocumentService } from '../../../services/evidenceDocumentService'
import { XP_PENDING_REVIEW_MESSAGE, xpPendingReview, earnedTaskXp } from '@shared/xpReview'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'toast-1'), dismiss: vi.fn(),
  })
  return { default: toast, toast }
})
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseTaskGeneration: false, hasAccess: false }),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'stu-1' }, effectiveRole: 'student' }),
}))
vi.mock('../../../hooks/useHidePillars', () => ({ default: () => false }))
vi.mock('../../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: null }),
  useOrgFeature: () => false,
}))
vi.mock('../../../hooks/useStudentScope', () => ({
  useStudentScope: () => ({ studentId: null, params: {}, isDelegated: false }),
}))
vi.mock('../../../services/evidenceDocumentService', () => ({
  evidenceDocumentService: {
    getDocument: vi.fn(), saveDocument: vi.fn(), uploadFile: vi.fn(), deleteStorageUrls: vi.fn(),
  },
}))
vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn(), patch: vi.fn() },
}))
vi.mock('../taskWorkspace/TaskEvidenceSection', () => ({
  default: ({ handleMarkComplete }) => <button onClick={handleMarkComplete}>mark done</button>,
}))

const TASK = { id: 'task-1', title: 'Build a bridge', pillar: 'stem', xp_amount: 50, is_completed: false }

beforeEach(() => {
  vi.clearAllMocks()
  evidenceDocumentService.getDocument.mockResolvedValue({
    success: true, blocks: [{ id: 'b1', block_type: 'text', content: { text: 'my work' } }],
  })
})

const complete = async (answer) => {
  evidenceDocumentService.saveDocument.mockResolvedValue({ success: true, blocks: [{ id: 'b1', order_index: 0 }], ...answer })
  const onTaskComplete = vi.fn()
  render(<TaskWorkspace task={TASK} tasks={[TASK]} questId="quest-1" onTaskComplete={onTaskComplete} />)
  await waitFor(() => expect(evidenceDocumentService.getDocument).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 0))
  fireEvent.click(screen.getByText('mark done'))
  await waitFor(() => expect(onTaskComplete).toHaveBeenCalled())
  return onTaskComplete.mock.calls[0][0]
}

describe('TaskWorkspace completion when the XP waits for a teacher', () => {
  it('says the XP comes when the teacher accepts, and counts none as earned', async () => {
    const done = await complete({ xp_awarded: 0, xp_pending_review: true })
    expect(done.message).toBe('Sent to your teacher. You get the XP when they accept it.')
    expect(done.xp_awarded).toBe(0)
    expect(done.xp_pending_review).toBe(true)
  })

  it('without a hold says what it always said', async () => {
    const done = await complete({ xp_awarded: 50 })
    expect(done.message).toBe('Task completed! You earned 50 XP')
    expect(done.xp_awarded).toBe(50)
    expect(done.xp_pending_review).toBe(false)
  })
})

describe('@shared/xpReview', () => {
  it('reads the flag from either completion endpoint', () => {
    expect(xpPendingReview({ xp_pending_review: true })).toBe(true)
    expect(xpPendingReview({ data: { xp_pending_review: true } })).toBe(true)
    expect(xpPendingReview({ xp_awarded: 50 })).toBe(false)
    expect(xpPendingReview(undefined)).toBe(false)
  })

  it('leaves held tasks out of earned XP', () => {
    const tasks = [
      { is_completed: true, xp_value: 50 },
      { is_completed: true, xp_value: 30, xp_pending_review: true },
      { is_completed: false, xp_value: 20 },
    ]
    expect(earnedTaskXp(tasks)).toBe(50)
    expect(XP_PENDING_REVIEW_MESSAGE).toBe('Sent to your teacher. You get the XP when they accept it.')
  })
})
