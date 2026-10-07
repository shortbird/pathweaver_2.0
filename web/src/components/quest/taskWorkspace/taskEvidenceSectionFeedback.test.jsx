import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaskEvidenceSection from './TaskEvidenceSection'

/**
 * The feedback thread on a task, and its unread state.
 *
 * Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or
 * the inbox with a small badge, and students miss it. A banner or pop-up
 * attached to the quest itself would make sure they see it." The banner opens
 * the task; the thread there must show (on any task a teacher wrote on, not
 * only a completed one) and must be told to mark the note read.
 */

vi.mock('../../evidence/EvidenceDisplay', () => ({ default: () => <div data-testid="evidence" /> }))
vi.mock('../../credit/CreditFeedbackThread', () => ({
  default: ({ completionId, markRead }) => (
    <div data-testid="thread" data-completion={completionId} data-mark-read={String(markRead)} />
  ),
}))

const renderTask = (task, extra = {}) => render(
  <TaskEvidenceSection
    task={{ id: 't1', title: 'Sketch the cone', ...task }}
    isTaskCompleted={!!task.is_completed}
    evidenceBlocks={[]}
    isLoading={false}
    setIsModalOpen={vi.fn()}
    {...extra}
  />,
)

describe('the feedback thread on a task', () => {
  it('shows on a task a teacher wrote on even when the task is not complete', () => {
    renderTask({ is_completed: false, completion_id: 'comp-1', feedback_count: 1 })
    expect(screen.getByTestId('thread')).toHaveAttribute('data-completion', 'comp-1')
  })

  it('stays hidden on an unfinished task nobody wrote on', () => {
    renderTask({ is_completed: false, completion_id: 'comp-1', feedback_count: 0 })
    expect(screen.queryByTestId('thread')).not.toBeInTheDocument()
  })

  it('asks the thread to mark read while a note is unread', () => {
    renderTask({ is_completed: true, completion_id: 'comp-1', feedback_count: 2, unread_feedback: 2 })
    expect(screen.getByTestId('thread')).toHaveAttribute('data-mark-read', 'true')
  })

  it('does not mark anything read when nothing is unread', () => {
    renderTask({ is_completed: true, completion_id: 'comp-1', feedback_count: 2, unread_feedback: 0 })
    expect(screen.getByTestId('thread')).toHaveAttribute('data-mark-read', 'false')
  })

  it('still finds the completion through portfolioPick on an older payload', () => {
    renderTask({ is_completed: true }, { portfolioPick: { completionId: 'comp-9' } })
    expect(screen.getByTestId('thread')).toHaveAttribute('data-completion', 'comp-9')
  })
})
