/**
 * Request Credit shows the AI precheck first, and never stands in the way.
 *
 * The student sees roughly what the reviewer's AI would say about the work as
 * it stands, then chooses: submit, or keep working. Whatever the preview says,
 * Submit is offered -- a person makes the call, and a student who thinks the
 * AI missed something is exactly who should send it on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

import TaskWorkspace from '../TaskWorkspace'

const TASK = {
  id: 'task-1',
  title: 'Test the New Brake Lights',
  pillar: 'stem',
  xp_amount: 75,
  is_completed: true,
}

const NEEDS_WORK = {
  available: true,
  likelihood: 'needs_work',
  criteria: [
    { criterion: 'Tested with weight', verdict: 'met' },
    { criterion: 'Recorded the results', verdict: 'partial' },
  ],
  suggestion: 'Add the weights you used.',
  unread: [{ label: 'Bridge notes', reason: 'the link is not public' }],
  criteria_source: 'success_criteria',
}

let precheckAnswer

beforeEach(() => {
  vi.clearAllMocks()
  aiAccess.hasAccess = true
  precheckAnswer = () => Promise.resolve({ data: { data: NEEDS_WORK } })
  api.get.mockImplementation((url) => {
    if (url.includes('/credit-status')) {
      return Promise.resolve({ data: { data: { has_completion: true, diploma_status: 'none' } } })
    }
    return Promise.resolve({ data: {} })
  })
  api.post.mockImplementation((url) => {
    if (url.includes('/credit-precheck')) return precheckAnswer()
    if (url.includes('/request-credit')) {
      return Promise.resolve({ data: { data: { success: true, diploma_status: 'pending_review' } } })
    }
    return Promise.resolve({ data: {} })
  })
})

const openPrecheck = async () => {
  render(<TaskWorkspace task={TASK} tasks={[TASK]} questId="quest-1" />)
  fireEvent.click(await screen.findByTitle('Request diploma credit for this task'))
}

const requestedCredit = () =>
  api.post.mock.calls.some(([url]) => url.includes('/request-credit'))

describe('Request Credit precheck', () => {
  it('runs the precheck instead of submitting straight away', async () => {
    await openPrecheck()

    expect(await screen.findByText('Might come back for more work')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/tasks/task-1/credit-precheck', {})
    expect(requestedCredit()).toBe(false)
  })

  it('says plainly that it is not the official review', async () => {
    await openPrecheck()
    expect(screen.getByText(/not an official review/)).toBeInTheDocument()
  })

  it('shows the checklist, the suggestion and what it could not open', async () => {
    await openPrecheck()

    expect(await screen.findByText('Recorded the results')).toBeInTheDocument()
    expect(screen.getByText('Partly there')).toBeInTheDocument()
    expect(screen.getByText('Add the weights you used.')).toBeInTheDocument()
    expect(screen.getByText('Bridge notes')).toBeInTheDocument()
  })

  it('still lets the student submit when the preview expects more work', async () => {
    await openPrecheck()

    fireEvent.click(await screen.findByRole('button', { name: 'Submit for review anyway' }))
    await waitFor(() => expect(requestedCredit()).toBe(true))
    expect(await screen.findByText('Awaiting Review')).toBeInTheDocument()
  })

  it('keeps working without submitting anything', async () => {
    await openPrecheck()

    fireEvent.click(await screen.findByRole('button', { name: 'Keep working' }))
    await waitFor(() => expect(screen.queryByText('Might come back for more work')).not.toBeInTheDocument())
    expect(requestedCredit()).toBe(false)
  })

  it('offers submit when the preview has no answer this time', async () => {
    precheckAnswer = () => Promise.resolve({ data: { data: { available: false, reason: 'busy' } } })
    await openPrecheck()

    expect(await screen.findByText(/The preview is busy right now/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    await waitFor(() => expect(requestedCredit()).toBe(true))
  })

  it('offers submit when the preview request itself fails', async () => {
    precheckAnswer = () => Promise.reject({ response: { status: 429 } })
    await openPrecheck()

    expect(await screen.findByText(/run the preview a lot/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeEnabled()
  })

  it('submits as before when AI is off for the student', async () => {
    aiAccess.hasAccess = false
    await openPrecheck()

    await waitFor(() => expect(requestedCredit()).toBe(true))
    expect(api.post).not.toHaveBeenCalledWith('/api/tasks/task-1/credit-precheck', expect.anything())
  })

  it('submits as before when the server says AI is off for this student', async () => {
    precheckAnswer = () => Promise.resolve({ data: { data: { available: false, reason: 'ai_disabled' } } })
    await openPrecheck()

    await waitFor(() => expect(requestedCredit()).toBe(true))
    expect(screen.queryByText('Before you request credit')).not.toBeInTheDocument()
  })
})
