/**
 * Inside a class quest, Request Credit is hidden: a class is credited as a
 * whole by class review. An own-curriculum course is a class quest whose
 * credit is requested task by task -- its semester check-ins and any task the
 * family adds -- so it keeps the button (creditPerTask).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaskWorkspace from '../TaskWorkspace'

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

const { aiAccess } = vi.hoisted(() => ({ aiAccess: { hasAccess: true } }))
vi.mock('../../../contexts/AIAccessContext', () => ({
  useAIAccess: () => ({ canUseTaskGeneration: false, hasAccess: aiAccess.hasAccess }),
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

const TASK = {
  id: 'task-1',
  title: 'Test the New Brake Lights',
  pillar: 'stem',
  xp_amount: 75,
  is_completed: true,
}


beforeEach(() => {
  vi.clearAllMocks()
  aiAccess.hasAccess = false
  api.get.mockImplementation((url) => {
    if (url.includes('/credit-status')) {
      return Promise.resolve({ data: { data: { has_completion: true, diploma_status: 'none' } } })
    }
    return Promise.resolve({ data: {} })
  })
})

describe('per-task credit inside a class quest', () => {
  it('is hidden in an ordinary Optio class', async () => {
    render(<TaskWorkspace task={TASK} tasks={[TASK]} questId="quest-1" isClassQuest />)
    await screen.findByText(/\+75 XP/)
    expect(screen.queryByTitle('Request diploma credit for this task')).not.toBeInTheDocument()
  })

  it('is offered in an own-curriculum course', async () => {
    render(<TaskWorkspace task={TASK} tasks={[TASK]} questId="quest-1" isClassQuest creditPerTask />)
    expect(await screen.findByTitle('Request diploma credit for this task')).toBeInTheDocument()
  })
})
