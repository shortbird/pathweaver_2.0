import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubmissionReviewCard from './SubmissionReviewCard'

// The review mutation isn't exercised here; stub it so the component mounts.
vi.mock('../../hooks/api/useBounties', () => ({
  useReviewBounty: () => ({ mutate: vi.fn(), isPending: false }),
}))

const bounty = {
  id: 'b-1',
  title: 'Build a Bird Feeder',
  deliverables: [{ id: 'd1', text: 'Photo of completed feeder' }],
}
const claim = {
  id: 'claim-9',
  status: 'submitted',
  submitted_at: '2026-03-20T10:00:00Z',
  student: { display_name: 'Jane Doe' },
  evidence: { deliverable_evidence: { d1: [{ type: 'text', content: { text: 'Done' } }] } },
}

describe('SubmissionReviewCard', () => {
  beforeEach(() => {
    // jsdom doesn't implement scrollIntoView; provide a spy so the highlight
    // effect can call it without throwing.
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders without highlight by default', () => {
    render(<SubmissionReviewCard bounty={bounty} claim={claim} />)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.queryByTestId('highlighted-submission')).not.toBeInTheDocument()
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('marks the card and scrolls it into view when highlighted', () => {
    render(<SubmissionReviewCard bounty={bounty} claim={claim} highlight />)
    const card = screen.getByTestId('highlighted-submission')
    expect(card).toBeInTheDocument()
    expect(card.className).toContain('ring-2')
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
