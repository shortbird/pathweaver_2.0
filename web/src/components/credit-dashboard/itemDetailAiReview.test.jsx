import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import api from '../../services/api'
import { toast } from 'react-hot-toast'
import ItemDetail from './ItemDetail'
import { withConfirm } from '../../tests/confirmTestUtils'

vi.mock('../../services/api', () => ({
  default: { post: vi.fn().mockResolvedValue({ data: { success: true } }) },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

/**
 * Answer the open confirmation by its real label.
 *
 * confirmTestUtils.answerConfirm() clicks a button named "Confirm", and these
 * dialogs deliberately name their buttons after the action ("Replace",
 * "Approve", "Send it back") -- a reviewer reading "Confirm" under a paragraph
 * of AI feedback has to work out what they are confirming.
 */
const answer = async (label) => {
  // Scoped to the dialog: the page has its own Approve button, and an unscoped
  // query matches both.
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: label }))
}

const REVIEW = {
  recommendation: 'approve',
  confidence: 0.9,
  summary: 'The evidence covers the criterion.',
  criteria: [{ index: 1, verdict: 'met', evidence_refs: [1], note: 'Shown.' }],
  xp: { requested: 200, recommended: 100, changed: true, rationale: 'One photo.' },
  feedback: { celebrate: 'You tested it properly.', grow_this: 'Add the numbers.' },
  concerns: [],
  flags: [],
  evidence: [{ index: 1, block_id: 'blk-1', label: 'bridge.jpg',
               status: 'read', how: 'inline' }],
  evidence_read: { items: 1, read: 1, skipped: 0 },
}

const item = { completion_id: 'comp-1', xp_value: 200, student_name: 'Clare B' }

function renderDetail({
  role = 'superadmin', status = 'pending_review', ai = { status: 'complete', review: REVIEW },
  acceptAiRef, onGrowThis,
} = {}) {
  const detail = {
    completion: { id: 'comp-1', user_id: 'student-1', diploma_status: status,
                  user_quest_task_id: 'task-1' },
    task: { id: 'task-1', title: 'Load test', xp_value: 200,
            success_criteria: ['Tested it with weight'],
            diploma_subjects: ['science'], subject_xp_distribution: { science: 200 } },
    quest: { id: 'q1', title: 'Bridge' },
    student: { display_name: 'Clare B' },
    evidence_blocks: [{ id: 'blk-1', block_type: 'text', content: { text: 'I tested it.' } }],
    review_rounds: [],
    suggested_subjects: { science: 200 },
    is_org_student: false,
    ai,
  }
  return render(withConfirm(
    <ItemDetail
      item={item}
      detail={detail}
      loading={false}
      effectiveRole={role}
      onRefresh={vi.fn()}
      onAdvance={vi.fn()}
      onGrowThis={onGrowThis || vi.fn()}
      onFeedbackChange={vi.fn()}
      feedbackTextareaRef={{ current: null }}
      onRerunAi={vi.fn()}
      acceptAiRef={acceptAiRef}
    />,
  ))
}

const approveBody = () => api.post.mock.calls.find(
  ([url]) => /\/(org-)?approve$/.test(url))?.[1]

describe('ItemDetail — the AI review panel', () => {
  beforeEach(() => {
    api.post.mockClear()
    toast.error.mockClear()
  })

  it('annotates the Definition of Done rather than replacing it', () => {
    renderDetail()
    expect(screen.getByText('Tested it with weight')).toBeInTheDocument()
    expect(screen.getByText('Shown.')).toBeInTheDocument()
  })

  it('does not show the panel to an org admin', () => {
    // The AI's verdict is addressed to whoever makes the final call.
    renderDetail({ role: 'org_admin', status: 'pending_org_approval' })
    expect(screen.queryByText(/AI review/)).toBeNull()
  })

  it('does not show a panel when no review has run', () => {
    renderDetail({ ai: { status: 'not_run' } })
    expect(screen.queryByText(/AI review/)).toBeNull()
  })
})

describe('ItemDetail — accepting the AI feedback', () => {
  beforeEach(() => { api.post.mockClear() })

  it('fills an empty feedback box without asking', async () => {
    renderDetail()
    fireEvent.click(screen.getAllByRole('button', { name: 'Use this' })[0])
    await waitFor(() => expect(
      screen.getByPlaceholderText(/feedback/i).value).toBe('You tested it properly.'))
  })

  it('asks before overwriting what the reviewer wrote', async () => {
    renderDetail()
    const box = screen.getByPlaceholderText(/feedback/i)
    fireEvent.change(box, { target: { value: 'My own words' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Use this' })[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await answer('Keep mine')
    await waitFor(() => expect(box.value).toBe('My own words'))
  })

  it('replaces it once the reviewer agrees', async () => {
    renderDetail()
    const box = screen.getByPlaceholderText(/feedback/i)
    fireEvent.change(box, { target: { value: 'My own words' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Use this' })[0])
    await answer('Replace')
    await waitFor(() => expect(box.value).toBe('You tested it properly.'))
  })
})

describe('ItemDetail — accepting the AI XP figure', () => {
  beforeEach(() => { api.post.mockClear(); toast.error.mockClear() })

  it('rescales the subject split and shows the new total', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 100 XP' }))
    await waitFor(() => expect(screen.getByText(/Total: 100 XP/)).toBeInTheDocument())
  })

  it('shows the change in the header', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 100 XP' }))
    expect(await screen.findByText('AI-adjusted')).toBeInTheDocument()
  })

  it('sends the accepted figure with the approval', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 100 XP' }))
    fireEvent.click(screen.getByRole('button', { name: /^approve/i }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBe(100)
    expect(approveBody().xp_reason).toBe('One photo.')
  })

  it('sends nothing about XP when the reviewer did not accept it', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /^approve/i }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBeUndefined()
  })

  it('records that the reviewer took the AI XP', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 100 XP' }))
    fireEvent.click(screen.getByRole('button', { name: /^approve/i }))
    await waitFor(() => expect(approveBody()?.ai_accepted).toBeTruthy())
    expect(approveBody().ai_accepted.xp).toBe(true)
  })

  it('refuses to approve when the reviewer edits the split out of step', async () => {
    // The server rejects this too. Catching it here means the reviewer finds
    // out before the row optimistically leaves the queue.
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 100 XP' }))
    const xpInput = screen.getAllByRole('spinbutton')[0]
    fireEvent.change(xpInput, { target: { value: '160' } })
    fireEvent.click(screen.getByRole('button', { name: /^approve/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(approveBody()).toBeUndefined()
  })
})

describe('ItemDetail — taking the whole recommendation', () => {
  beforeEach(() => { api.post.mockClear(); toast.error.mockClear() })

  it('approves with the AI feedback and XP after confirming', async () => {
    const acceptAiRef = { current: null }
    renderDetail({ acceptAiRef })
    acceptAiRef.current()
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Approve at 100 XP/)
    await answer('Approve')
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().feedback).toBe('You tested it properly.')
    expect(approveBody().xp_value).toBe(100)
    expect(approveBody().ai_accepted.feedback).toBe('celebrate')
  })

  it('does nothing if the reviewer cancels', async () => {
    const acceptAiRef = { current: null }
    renderDetail({ acceptAiRef })
    acceptAiRef.current()
    await answer('Cancel')
    await new Promise(r => setTimeout(r, 20))
    expect(approveBody()).toBeUndefined()
  })

  it('returns the work when that is the recommendation', async () => {
    const onGrowThis = vi.fn()
    const acceptAiRef = { current: null }
    renderDetail({
      acceptAiRef,
      onGrowThis,
      ai: { status: 'complete', review: { ...REVIEW, recommendation: 'grow_this' } },
    })
    acceptAiRef.current()
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Return this for more/)
    await answer('Send it back')
    await waitFor(() => expect(onGrowThis).toHaveBeenCalledWith('comp-1', 'Add the numbers.'))
  })

  it('refuses when the AI wanted a person to look', async () => {
    const acceptAiRef = { current: null }
    renderDetail({
      acceptAiRef,
      ai: { status: 'complete', review: { ...REVIEW, recommendation: 'needs_human' } },
    })
    acceptAiRef.current()
    await new Promise(r => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(approveBody()).toBeUndefined()
  })

  it('says so when there is no verdict to take', async () => {
    const acceptAiRef = { current: null }
    renderDetail({ acceptAiRef, ai: { status: 'failed', error: 'busy' } })
    acceptAiRef.current()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/no AI verdict/i)))
  })
})
