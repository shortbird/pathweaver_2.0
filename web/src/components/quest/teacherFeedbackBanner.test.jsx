import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TeacherFeedbackBanner from './TeacherFeedbackBanner'

/**
 * Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or
 * the inbox with a small badge, and students miss it. A banner or pop-up
 * attached to the quest itself would make sure they see it."
 */

const feedback = {
  task_id: 't1', task_title: 'Sketch the cone', completion_id: 'comp-1',
  author_name: 'Dallin Bird', preview: 'Label the magma chamber.',
}

describe('TeacherFeedbackBanner', () => {
  it('names the task and shows who wrote what', () => {
    render(<TeacherFeedbackBanner count={1} feedback={feedback} />)
    expect(screen.getByText('Your teacher left feedback on Sketch the cone')).toBeInTheDocument()
    expect(screen.getByText('Dallin Bird:')).toBeInTheDocument()
    expect(screen.getByText('Label the magma chamber.')).toBeInTheDocument()
    expect(screen.queryByText(/more new note/)).not.toBeInTheDocument()
  })

  it('says how many more notes are waiting', () => {
    render(<TeacherFeedbackBanner count={3} feedback={feedback} />)
    expect(screen.getByText('2 more new notes on this quest')).toBeInTheDocument()
  })

  it('renders nothing with a count of 0', () => {
    const { container } = render(<TeacherFeedbackBanner count={0} feedback={feedback} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing without a note to preview', () => {
    const { container } = render(<TeacherFeedbackBanner count={1} feedback={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('Read feedback hands the note to the page', () => {
    const onRead = vi.fn()
    render(<TeacherFeedbackBanner count={1} feedback={feedback} onRead={onRead} />)
    fireEvent.click(screen.getByRole('button', { name: 'Read feedback' }))
    expect(onRead).toHaveBeenCalledWith(feedback)
  })
})
