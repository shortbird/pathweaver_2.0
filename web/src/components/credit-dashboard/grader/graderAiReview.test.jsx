/**
 * The AI in the grader: what it proposes, and the two ways a reviewer answers.
 *
 * The accept button submits exactly what the card shows -- the note, the XP --
 * with no dialog, because the card IS the confirmation. The keyboard path still
 * asks, since a stray keypress must not award credit. Everything else on the
 * right-hand column is the override: any input the reviewer changes wins over
 * the AI, and the approval records which parts of the AI's answer were kept.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import GraderView from './GraderView'
import { withConfirm } from '../../../tests/confirmTestUtils'

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { success: true, messages: [] } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

/**
 * Answer the open confirmation by its real label.
 *
 * These dialogs name their buttons after the action ("Replace", "Approve",
 * "Send it back") -- a reviewer reading "Confirm" under a paragraph of AI
 * feedback has to work out what they are confirming.
 */
const answer = async (label) => {
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

const item = {
  completion_id: 'comp-1', student_id: 'student-1', xp_value: 200,
  student_name: 'Clare B', task_title: 'Load test', diploma_status: 'pending_review',
}

function renderGrader({
  role = 'superadmin', status = 'pending_review', ai = { status: 'complete', review: REVIEW },
  decisionRef, onAdvance, onRerunAi, subjects = { science: 200 },
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
    suggested_subjects: subjects,
    is_org_student: false,
    ai,
  }
  return render(withConfirm(
    <GraderView
      item={{ ...item, diploma_status: status }}
      detail={detail}
      loading={false}
      studentContext={null}
      effectiveRole={role}
      index={0}
      total={1}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onExit={vi.fn()}
      onAdvance={onAdvance || vi.fn()}
      onRefresh={vi.fn()}
      feedbackTextareaRef={{ current: null }}
      onRerunAi={onRerunAi || vi.fn()}
      decisionRef={decisionRef}
    />,
  ))
}

const approveBody = () => api.post.mock.calls.find(
  ([url]) => /\/(org-)?approve$/.test(url))?.[1]
const growBody = () => api.post.mock.calls.find(
  ([url]) => /\/(org-)?grow-this$/.test(url))?.[1]

beforeEach(() => {
  api.post.mockClear()
  toast.error.mockClear()
  toast.mockClear()
})

describe('the AI card', () => {
  it('annotates the Definition of Done rather than replacing it', () => {
    renderGrader()
    expect(screen.getByText('Tested it with weight')).toBeInTheDocument()
    expect(screen.getByText('Shown.')).toBeInTheDocument()
  })

  it('shows the verdict, the XP and the note it would send', () => {
    renderGrader()
    expect(screen.getByText(/recommends approving/)).toBeInTheDocument()
    expect(screen.getByText('100 XP', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('You tested it properly.')).toBeInTheDocument()
    expect(screen.getByText('90% confident')).toBeInTheDocument()
  })

  it('shows the return note when that is the recommendation', () => {
    renderGrader({ ai: { status: 'complete', review: { ...REVIEW, recommendation: 'grow_this' } } })
    expect(screen.getByText(/recommends returning/)).toBeInTheDocument()
    expect(screen.getByText('Add the numbers.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Accept: send back/ })).toBeInTheDocument()
  })

  it('is not shown to an org admin', () => {
    // The AI's verdict is addressed to whoever makes the final call.
    renderGrader({ role: 'org_admin', status: 'pending_org_approval' })
    expect(screen.queryByText(/AI recommendation/)).toBeNull()
  })

  it('offers to run the review when none has', () => {
    const onRerunAi = vi.fn()
    renderGrader({ ai: { status: 'not_run' }, onRerunAi })
    expect(screen.queryByText(/recommends/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Run AI review' }))
    expect(onRerunAi).toHaveBeenCalledWith('comp-1')
  })

  it('says the AI is reading while it runs', () => {
    renderGrader({ ai: { status: 'running' } })
    expect(screen.getByText(/Reading the evidence/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Accept/ })).toBeNull()
  })

  it('reports a failed review and offers a re-run', () => {
    renderGrader({ ai: { status: 'failed', error: 'timeout' } })
    expect(screen.getByText(/did not finish/)).toBeInTheDocument()
    expect(screen.getByText('timeout')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-run' })).toBeInTheDocument()
  })

  it('explains when the review was skipped for the student', () => {
    renderGrader({ ai: { status: 'skipped', skip_reason: 'ai_disabled_for_student' } })
    expect(screen.getByText(/turned off for this student/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-run' })).toBeNull()
  })

  it('sends the reviewer below when the AI wants a person', () => {
    renderGrader({ ai: { status: 'complete', review: { ...REVIEW, recommendation: 'needs_human' } } })
    expect(screen.getByText(/wants a person to read this one/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Accept/ })).toBeNull()
    // With nothing to accept, the reviewer's own Approve is the primary action.
    expect(screen.getByRole('button', { name: /^Approve at 200 XP/ })).toHaveClass('btn-primary')
  })
})

describe('the accept button', () => {
  it('approves with the AI note and XP, and no dialog', async () => {
    renderGrader()
    fireEvent.click(screen.getByRole('button', { name: /Accept: approve at 100 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(approveBody().feedback).toBe('You tested it properly.')
    expect(approveBody().xp_value).toBe(100)
    expect(approveBody().xp_reason).toBe('One photo.')
    expect(approveBody().subjects).toEqual({ science: 100 })
    expect(approveBody().ai_accepted).toEqual({ feedback: 'celebrate', xp: true })
  })

  it('approves at the claimed XP when the AI did not change it', async () => {
    renderGrader({ ai: { status: 'complete', review: {
      ...REVIEW, xp: { requested: 200, recommended: 200, changed: false } } } })
    fireEvent.click(screen.getByRole('button', { name: /Accept: approve at 200 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBeUndefined()
    expect(approveBody().ai_accepted).toEqual({ feedback: 'celebrate', xp: false })
  })

  it('returns the work with the AI note when that is the recommendation', async () => {
    renderGrader({ ai: { status: 'complete', review: { ...REVIEW, recommendation: 'grow_this' } } })
    fireEvent.click(screen.getByRole('button', { name: /Accept: send back/ }))
    await waitFor(() => expect(growBody()).toBeTruthy())
    expect(growBody().feedback).toBe('Add the numbers.')
    expect(growBody().ai_accepted).toEqual({ feedback: 'grow_this' })
  })

  it('drops the row before the request returns', async () => {
    const onAdvance = vi.fn()
    renderGrader({ onAdvance })
    fireEvent.click(screen.getByRole('button', { name: /Accept: approve/ }))
    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith('comp-1'))
  })

  it('is absent when the item is not at a stage the reviewer can act on', () => {
    renderGrader({ status: 'finalized' })
    expect(screen.queryByRole('button', { name: /^Accept/ })).toBeNull()
  })
})

describe('the keyboard path still confirms', () => {
  it('approves with the AI feedback and XP after confirming', async () => {
    const decisionRef = { current: null }
    renderGrader({ decisionRef })
    decisionRef.current.acceptAi()
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Approve at 100 XP/)
    await answer('Approve')
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().feedback).toBe('You tested it properly.')
    expect(approveBody().xp_value).toBe(100)
    expect(approveBody().ai_accepted.feedback).toBe('celebrate')
  })

  it('does nothing if the reviewer cancels', async () => {
    const decisionRef = { current: null }
    renderGrader({ decisionRef })
    decisionRef.current.acceptAi()
    await answer('Cancel')
    await new Promise(r => setTimeout(r, 20))
    expect(approveBody()).toBeUndefined()
  })

  it('returns the work when that is the recommendation', async () => {
    const decisionRef = { current: null }
    renderGrader({
      decisionRef,
      ai: { status: 'complete', review: { ...REVIEW, recommendation: 'grow_this' } },
    })
    decisionRef.current.acceptAi()
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Return this for more/)
    await answer('Send it back')
    await waitFor(() => expect(growBody()?.feedback).toBe('Add the numbers.'))
  })

  it('refuses when the AI wanted a person to look', async () => {
    const decisionRef = { current: null }
    renderGrader({
      decisionRef,
      ai: { status: 'complete', review: { ...REVIEW, recommendation: 'needs_human' } },
    })
    decisionRef.current.acceptAi()
    await new Promise(r => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(approveBody()).toBeUndefined()
  })

  it('says so when there is no verdict to take', async () => {
    const decisionRef = { current: null }
    renderGrader({ decisionRef, ai: { status: 'failed', error: 'busy' } })
    decisionRef.current.acceptAi()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/no AI verdict/i)))
  })

  it('routes the approve shortcut through the same handler as the button', async () => {
    const decisionRef = { current: null }
    renderGrader({ decisionRef })
    fireEvent.change(screen.getByLabelText('XP for science'), { target: { value: '150' } })
    fireEvent.click(screen.getByText('Apply 100 XP'))
    decisionRef.current.approve()
    await waitFor(() => expect(approveBody()).toBeTruthy())
    // The edit the reviewer made is what gets sent, not a bare {}.
    expect(approveBody().xp_value).toBe(100)
    expect(approveBody().subjects).toEqual({ science: 100 })
  })
})

describe('overriding the note', () => {
  it('fills an empty feedback box from a draft without asking', async () => {
    renderGrader()
    fireEvent.click(screen.getByRole('button', { name: 'Use return draft' }))
    await waitFor(() => expect(
      screen.getByPlaceholderText(/feedback/i).value).toBe('Add the numbers.'))
  })

  it('asks before overwriting what the reviewer wrote', async () => {
    renderGrader()
    const box = screen.getByPlaceholderText(/feedback/i)
    fireEvent.change(box, { target: { value: 'My own words' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use approve draft' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await answer('Keep mine')
    await waitFor(() => expect(box.value).toBe('My own words'))
  })

  it('replaces it once the reviewer agrees', async () => {
    renderGrader()
    const box = screen.getByPlaceholderText(/feedback/i)
    fireEvent.change(box, { target: { value: 'My own words' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use approve draft' }))
    await answer('Replace')
    await waitFor(() => expect(box.value).toBe('You tested it properly.'))
  })

  it('sends the reviewer\'s own note and records that no draft was used', async () => {
    renderGrader()
    fireEvent.change(screen.getByPlaceholderText(/feedback/i), { target: { value: 'Nice bridge.' } })
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 200 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().feedback).toBe('Nice bridge.')
    expect(approveBody().xp_value).toBeUndefined()
    expect(approveBody().ai_accepted).toEqual({ feedback: null, xp: false })
  })

  it('offers the older AI draft only when the review wrote no return note', () => {
    renderGrader({ ai: { status: 'not_run' } })
    expect(screen.getByRole('button', { name: 'Suggest with AI' })).toBeInTheDocument()
  })
})

describe('overriding the XP', () => {
  it('takes the AI figure on request and rescales the split', async () => {
    renderGrader()
    fireEvent.click(screen.getByText('Apply 100 XP'))
    await waitFor(() => expect(screen.getByText(/Total: 100 XP/)).toBeInTheDocument())
    expect(screen.getByText('AI-adjusted')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Approve at 100 XP/ })).toBeInTheDocument()
  })

  it('sends the accepted figure and the AI rationale with the approval', async () => {
    renderGrader()
    fireEvent.click(screen.getByText('Apply 100 XP'))
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 100 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBe(100)
    expect(approveBody().xp_reason).toBe('One photo.')
    expect(approveBody().ai_accepted.xp).toBe(true)
  })

  it('takes a figure the reviewer types, with the default reason', async () => {
    renderGrader()
    const field = screen.getByLabelText('XP to award')
    fireEvent.change(field, { target: { value: '150' } })
    fireEvent.blur(field)
    await waitFor(() => expect(screen.getByText(/Total: 150 XP/)).toBeInTheDocument())
    expect(screen.getByText('Adjusted')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 150 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBe(150)
    expect(approveBody().xp_reason).toBe('Adjusted during credit review')
    expect(approveBody().subjects).toEqual({ science: 150 })
    // A number of the reviewer's own is not the AI's, even though the AI offered one.
    expect(approveBody().ai_accepted.xp).toBe(false)
  })

  it('will not go below the platform floor', async () => {
    renderGrader()
    const field = screen.getByLabelText('XP to award')
    fireEvent.change(field, { target: { value: '5' } })
    fireEvent.blur(field)
    await waitFor(() => expect(screen.getByRole('button', { name: /^Approve at 25 XP/ }))
      .toBeInTheDocument())
  })

  it('reverts to the claim in one click', async () => {
    renderGrader()
    fireEvent.click(screen.getByText('Apply 100 XP'))
    fireEvent.click(await screen.findByText('Revert to 200 XP'))
    await waitFor(() => expect(screen.getByText(/Total: 200 XP/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 200 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBeUndefined()
  })

  it('follows a subject edit, so the split and the award never disagree', async () => {
    // The split IS the XP. The old pane let the two drift and then refused the
    // approval; now editing a subject moves the number on the button.
    renderGrader()
    fireEvent.click(screen.getByText('Apply 100 XP'))
    fireEvent.change(screen.getByLabelText('XP for science'), { target: { value: '160' } })
    expect(screen.queryByText(/needs/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 160 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBe(160)
    expect(approveBody().subjects).toEqual({ science: 160 })
    expect(approveBody().xp_reason).toBe('Adjusted during credit review')
  })

  it('drops the award by the amount of a removed subject', async () => {
    renderGrader({ subjects: { science: 150, math: 50 } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove math' }))
    expect(screen.getByRole('button', { name: /^Approve at 150 XP/ })).toBeInTheDocument()
    expect(screen.getByLabelText('XP to award').value).toBe('150')
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 150 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBe(150)
    expect(approveBody().subjects).toEqual({ science: 150 })
  })

  it('goes back to the claim when the split is put back', async () => {
    renderGrader({ subjects: { science: 150, math: 50 } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove math' }))
    fireEvent.change(screen.getByLabelText('XP for science'), { target: { value: '200' } })
    expect(screen.getByRole('button', { name: /^Approve at 200 XP/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 200 XP/ }))
    await waitFor(() => expect(approveBody()).toBeTruthy())
    expect(approveBody().xp_value).toBeUndefined()
  })

  it('refuses to approve below the platform floor', async () => {
    renderGrader({ subjects: { science: 180, math: 20 } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove science' }))
    fireEvent.click(screen.getByRole('button', { name: /^Approve at 20 XP/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/below 25/)))
    expect(approveBody()).toBeUndefined()
  })

  it('is read-only for an org admin', () => {
    renderGrader({ role: 'org_admin', status: 'pending_org_approval' })
    expect(screen.queryByLabelText('XP to award')).toBeNull()
  })
})
