/**
 * A teacher's feedback has to reach the student on the work it is about.
 *
 * Gryffin, 2026-08-31: "I submitted feedback on one of the submissions, and the
 * student doesn't see it anywhere or get notified that I sent any."
 *
 * The thread was real and the message was stored — the SIS submissions inbox
 * writes it, and the student was even notified. But the student's only view of
 * it was nested inside the Diploma page's credit tracker, behind an expandable
 * "iteration history" on a credit request. The notification pointed at
 * /quests/:id?task=:taskId, which selects the task and rendered no feedback at
 * all, so the trail ended on a page that showed nothing.
 *
 * These pin that a completed task shows its feedback thread, and that an
 * unfinished one (no completion, so no thread to load) does not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

vi.mock('../../../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseTaskGeneration: false }),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'stu-1' }, effectiveRole: 'student' }),
}))
vi.mock('../../../hooks/useHidePillars', () => ({ default: () => false }))
vi.mock('../../../contexts/OrganizationContext', () => ({
  useOrganization: () => ({ organization: null }),
  useOrgFeature: () => false,
}))

vi.mock('../../../services/evidenceDocumentService', () => ({
  evidenceDocumentService: {
    getDocument: vi.fn(() => Promise.resolve({ success: true, blocks: [] })),
    saveDocument: vi.fn(),
    uploadFile: vi.fn(),
  },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../../services/api', () => ({ default: api }))

import TaskWorkspace from '../TaskWorkspace'

const COMPLETION_ID = 'completion-1'

const COMPLETED_TASK = {
  id: 'task-1',
  title: 'Test the New Brake Lights',
  pillar: 'stem',
  xp_amount: 75,
  is_completed: true,
}

const OPEN_TASK = { ...COMPLETED_TASK, id: 'task-2', is_completed: false }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/credit-status')) {
      return Promise.resolve({ data: { data: { has_completion: true, diploma_status: 'none' } } })
    }
    if (url.includes('/api/portfolio/completions/by-task/')) {
      return Promise.resolve({
        data: { data: { has_completion: true, completion_id: COMPLETION_ID, in_portfolio: false } },
      })
    }
    if (url.includes('/messages')) {
      return Promise.resolve({
        data: {
          success: true,
          messages: [{
            id: 'm1',
            author_id: 'teacher-1',
            author_name: 'Dallin Bird',
            body: 'go deeper bro',
            is_mine: false,
          }],
        },
      })
    }
    return Promise.resolve({ data: {} })
  })
})

const renderWorkspace = (task) => render(
  <TaskWorkspace task={task} tasks={[task]} questId="quest-1" />
)

describe('TaskWorkspace — teacher feedback on submitted work', () => {
  it("shows the teacher's feedback on a completed task", async () => {
    renderWorkspace(COMPLETED_TASK)

    expect(await screen.findByText('Feedback conversation')).toBeInTheDocument()
    expect(await screen.findByText('go deeper bro')).toBeInTheDocument()
    // Named, not anonymised — the student should know who to talk to.
    expect(screen.getByText('Dallin Bird')).toBeInTheDocument()
  })

  it('loads the thread for the completion that belongs to this task', async () => {
    renderWorkspace(COMPLETED_TASK)

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(`/api/credit/${COMPLETION_ID}/messages`)
    })
  })

  it('lets the student reply, so feedback is a conversation', async () => {
    renderWorkspace(COMPLETED_TASK)

    await screen.findByText('Feedback conversation')
    expect(screen.getByPlaceholderText('Write a reply…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('shows no thread on a task that has not been completed', async () => {
    renderWorkspace(OPEN_TASK)

    await waitFor(() => expect(api.get).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/portfolio/completions/by-task/')
    ))
    expect(screen.queryByText('Feedback conversation')).not.toBeInTheDocument()
  })
})
