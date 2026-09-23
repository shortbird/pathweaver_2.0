import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaskEvidenceSection from './TaskEvidenceSection'

/**
 * "Accepted by <teacher>" on the task, for the family to see.
 *
 * iCreate, ticket 650aa9b9 (2026-09-23): "When I accept a task, the parent is
 * notified of which one, but then it doesn't show up on the task that it has
 * been accepted. Can we show somewhere on the task that I have accepted it, for
 * the parents to see?"
 */

vi.mock('../../evidence/EvidenceDisplay', () => ({ default: () => <div data-testid="evidence" /> }))
vi.mock('../../credit/CreditFeedbackThread', () => ({ default: () => null }))


const REVIEWED_AT = '2026-09-21T18:00:00+00:00'
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const renderTask = (task) => render(
  <TaskEvidenceSection
    task={{ id: 't1', title: 'Sketch the cone', xp_amount: 25, ...task }}
    isTaskCompleted={!!task.is_completed}
    evidenceBlocks={[]}
    isLoading={false}
    setIsModalOpen={vi.fn()}
  />,
)

describe('the Accepted chip on a task', () => {
  it('names the teacher and the date on an accepted task', () => {
    renderTask({
      is_completed: true,
      review: { action: 'accepted', reviewed_at: REVIEWED_AT, reviewer_name: 'Nicole Connole' },
    })
    expect(screen.getByText(`Accepted by Nicole Connole · ${shortDate(REVIEWED_AT)}`)).toBeInTheDocument()
  })

  it('is absent when no teacher has reviewed the task', () => {
    renderTask({ is_completed: true, review: null })
    expect(screen.queryByText(/Accepted by/)).not.toBeInTheDocument()
  })

  it('is absent when the payload predates the review field', () => {
    renderTask({ is_completed: true })
    expect(screen.queryByText(/Accepted by/)).not.toBeInTheDocument()
  })

  it('is absent on a task that is not complete', () => {
    renderTask({
      is_completed: false,
      review: { action: 'accepted', reviewed_at: REVIEWED_AT, reviewer_name: 'Nicole Connole' },
    })
    expect(screen.queryByText(/Accepted by/)).not.toBeInTheDocument()
  })

  it('falls back to "your teacher" when the reviewer has no name on file', () => {
    renderTask({ is_completed: true, review: { action: 'accepted', reviewed_at: null, reviewer_name: null } })
    expect(screen.getByText('Accepted by your teacher')).toBeInTheDocument()
  })
})
