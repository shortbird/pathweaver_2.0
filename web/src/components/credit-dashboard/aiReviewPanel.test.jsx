import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AiBadge from './AiBadge'
import AiCriteriaChecklist from './AiCriteriaChecklist'
import AiReviewPanel from './AiReviewPanel'

const review = {
  recommendation: 'approve',
  confidence: 0.91,
  summary: 'All three criteria are met.',
  criteria: [
    { index: 1, verdict: 'met', evidence_refs: [1], note: 'The photo shows it.' },
    { index: 2, verdict: 'partial', evidence_refs: [], note: 'No numbers given.' },
  ],
  xp: { requested: 200, recommended: 100, changed: true, rationale: 'One photo.' },
  feedback: { celebrate: 'You tested it properly.', grow_this: 'Add the numbers.' },
  concerns: [],
  flags: ['[E3] report.pdf: the PDF is password-protected'],
  evidence: [
    { index: 1, label: 'bridge.jpg', status: 'read', how: 'inline' },
    { index: 3, label: 'report.pdf', status: 'skipped',
      skip_reason: 'the PDF is password-protected' },
  ],
  evidence_read: { items: 2, read: 1, skipped: 1 },
}

const panel = (props = {}) => render(
  <AiReviewPanel
    ai={{ status: 'complete', review, model: 'test-model' }}
    requestedXp={200}
    canApplyXp
    appliedXp={null}
    onApplyXp={vi.fn()}
    onUseFeedback={vi.fn()}
    onRerun={vi.fn()}
    onJumpToEvidence={vi.fn()}
    {...props}
  />,
)

describe('AiBadge', () => {
  it('shows the recommendation and the confidence together', () => {
    // A reviewer scanning a queue needs both: "Approve 91%" and "Approve 62%"
    // are different instructions.
    render(<AiBadge status="complete" action="approve" confidence={0.91} />)
    expect(screen.getByText('AI: Approve 91%')).toBeInTheDocument()
  })

  it('renders nothing when the AI has not looked', () => {
    const { container } = render(<AiBadge status="not_run" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says so when AI is off for the student', () => {
    render(<AiBadge status="skipped" />)
    expect(screen.getByText('AI off')).toBeInTheDocument()
  })

  it('says so while it is still reading', () => {
    render(<AiBadge status="running" />)
    expect(screen.getByText('AI reading')).toBeInTheDocument()
  })

  it('carries the whole sentence for a screen reader', () => {
    render(<AiBadge status="complete" action="grow_this" confidence={0.5} />)
    expect(screen.getByLabelText(/recommends returning this for more, 50% confident/i))
      .toBeInTheDocument()
  })
})

describe('AiCriteriaChecklist', () => {
  it('renders the plain list when there is no review', () => {
    render(<AiCriteriaChecklist criteria={['Built it', 'Tested it']} aiReview={null} />)
    expect(screen.getByText('Built it')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /jump to evidence/i })).toBeNull()
  })

  it('gives every verdict screen-reader text, not just a colour', () => {
    // A red-green colourblind reviewer must get the same answer from the row.
    render(<AiCriteriaChecklist criteria={['A', 'B']} aiReview={review} />)
    expect(screen.getByText('Met.')).toBeInTheDocument()
    expect(screen.getByText('Partly met.')).toBeInTheDocument()
  })

  it('jumps to the cited evidence when a citation is clicked', () => {
    const onJump = vi.fn()
    render(<AiCriteriaChecklist criteria={['A', 'B']} aiReview={review}
                                onJumpToEvidence={onJump} readableRefs={[1]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Jump to evidence 1' }))
    expect(onJump).toHaveBeenCalledWith(1)
  })

  it('disables a citation pointing at evidence that is no longer there', () => {
    render(<AiCriteriaChecklist criteria={['A', 'B']} aiReview={review}
                                readableRefs={[]} />)
    expect(screen.getByRole('button', { name: 'Jump to evidence 1' })).toBeDisabled()
  })

  it('says when the task set no criteria of its own', () => {
    // A checklist implies a standard. If the task never set one, say so.
    render(<AiCriteriaChecklist
      criteria={[]}
      aiReview={{ criteria_source: 'task_description',
                  criteria: [{ index: 1, criterion: 'Do the thing', verdict: 'met' }] }} />)
    expect(screen.getByText(/task set no criteria/i)).toBeInTheDocument()
  })
})

describe('AiReviewPanel', () => {
  it('states the recommendation in words', () => {
    panel()
    expect(screen.getByText(/recommends approving this/i)).toBeInTheDocument()
  })

  it('offers both drafts whatever it recommends', () => {
    // The reviewer disagreeing is exactly when the other draft saves time.
    panel()
    expect(screen.getByText('You tested it properly.')).toBeInTheDocument()
    expect(screen.getByText('Add the numbers.')).toBeInTheDocument()
  })

  it('hands a draft to the feedback box on request', () => {
    const onUseFeedback = vi.fn()
    panel({ onUseFeedback })
    fireEvent.click(screen.getAllByRole('button', { name: 'Use this' })[0])
    expect(onUseFeedback).toHaveBeenCalledWith('You tested it properly.', 'celebrate')
  })

  it('offers the lower XP figure to a superadmin', () => {
    const onApplyXp = vi.fn()
    panel({ onApplyXp })
    fireEvent.click(screen.getByRole('button', { name: 'Apply 100 XP' }))
    expect(onApplyXp).toHaveBeenCalledWith(100)
  })

  it('offers a way back once it is applied', () => {
    const onApplyXp = vi.fn()
    panel({ appliedXp: 100, onApplyXp })
    fireEvent.click(screen.getByRole('button', { name: 'Revert to 200 XP' }))
    expect(onApplyXp).toHaveBeenCalledWith(null)
  })

  it('shows an org admin the figure but no way to apply it', () => {
    panel({ canApplyXp: false })
    expect(screen.getByText(/Optio sets the final XP/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apply 100 XP/ })).toBeNull()
  })

  it('says nothing about XP when the claim already fits', () => {
    panel({ ai: { status: 'complete', review: {
      ...review, xp: { requested: 200, recommended: 200, changed: false } } } })
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull()
    expect(screen.getByText(/200 XP fits this work/i)).toBeInTheDocument()
  })

  it('names what it could not read', () => {
    // The most important thing on the panel when it goes wrong.
    panel()
    expect(screen.getByText(/read 1 of 2 pieces/i)).toBeInTheDocument()
    expect(screen.getByText(/not read: the PDF is password-protected/i))
      .toBeInTheDocument()
  })

  it('does not repeat a per-file reason in the flag box', () => {
    // The loader raises a flag AND records the reason on the item. Showing both
    // buries the flags that are not about one file.
    panel()
    expect(screen.queryByText(/^\[E3\]/)).toBeNull()
  })

  it('still shows a flag that is not about one file', () => {
    panel({ ai: { status: 'complete', review: {
      ...review,
      flags: ['This task has no written Definition of Done.'] } } })
    expect(screen.getByText(/no written Definition of Done/i)).toBeInTheDocument()
  })

  it('explains a skipped review instead of showing a failure', () => {
    panel({ ai: { status: 'skipped', skip_reason: 'ai_disabled_for_student' } })
    expect(screen.getByText(/turned off for this student/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-run' })).toBeNull()
  })

  it('shows the error when a review failed', () => {
    panel({ ai: { status: 'failed', error: 'the model was busy' } })
    expect(screen.getByText(/did not finish/i)).toBeInTheDocument()
    expect(screen.getByText('the model was busy')).toBeInTheDocument()
  })

  it('offers to run one that never ran', () => {
    panel({ ai: { status: 'not_run' } })
    expect(screen.getByRole('button', { name: 'Run AI review' })).toBeInTheDocument()
  })

  it('will not start a second run while one is in flight', () => {
    panel({ ai: { status: 'running' } })
    expect(screen.getByRole('button', { name: /Reading/ })).toBeDisabled()
  })
})
