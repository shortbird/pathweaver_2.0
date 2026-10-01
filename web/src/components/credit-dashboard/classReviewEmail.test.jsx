/**
 * The class review email: built from every task's feedback, edited by the
 * reviewer, and sent only by Send.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import api from '../../services/api'
import ClassReviewEmail, { composeClassReviewEmail, withoutStockOpener } from './ClassReviewEmail'
import { withConfirm } from '../../tests/confirmTestUtils'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: { to: 'jake@example.com', cc: ['parent@example.com'] } } }),
    post: vi.fn().mockResolvedValue({ data: { data: { review_status: 'rejected', email_sent: true } } }),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const task = (id, title, state, feedback) => ({
  completion_id: id, title, review: { state, feedback },
})

const DETAIL = {
  quest: { id: 'q-1', title: 'Entrepreneurship', transcript_subject_display: 'Language Arts' },
  student: { first_name: 'Jake' },
  credits_earned: 0.5,
  can_approve: false,
  task_review_counts: { accepted: 1, returned: 1 },
  tasks: [
    task('c-1', 'Business plan', 'accepted', 'Clear and specific.'),
    task('c-2', 'Skier survey', 'returned', 'Add your survey results.'),
    task('c-3', 'Logo', 'accepted', null),
  ],
}

describe('composeClassReviewEmail', () => {
  it('is a compliment sandwich: positive, improvements, positive', () => {
    const { subject, body } = composeClassReviewEmail(DETAIL, 'send_back')
    expect(subject).toBe('Feedback on your class: Entrepreneurship')
    const paragraphs = body.split('\n\n')
    expect(paragraphs[0]).toBe('Hi Jake,')
    // Opens on the reviewer's own praise of an accepted task.
    expect(paragraphs[1]).toContain('Business plan stood out. Clear and specific.')
    expect(body).toContain('**Skier survey**\nAdd your survey results.')
    expect(body.indexOf('Business plan stood out')).toBeLessThan(body.indexOf('**Skier survey**'))
    expect(paragraphs[paragraphs.length - 1]).toMatch(/in good shape/)
    // A task with no note from the reviewer or the AI is left out.
    expect(body).not.toContain('Logo')
  })

  it("falls back to the AI's positive note when the reviewer wrote none", () => {
    const detail = {
      ...DETAIL,
      tasks: [
        { ...task('c-3', 'Logo', 'accepted', null), ai: { review: { feedback: { celebrate: 'The colors fit the brand.' } } } },
        task('c-2', 'Skier survey', 'returned', 'Add your survey results.'),
      ],
    }
    const { body } = composeClassReviewEmail(detail, 'send_back')
    expect(body.split('\n\n')[1]).toContain('Logo stood out. The colors fit the brand.')
  })

  it('announces the credit on approval and ends calmly', () => {
    const { subject, body } = composeClassReviewEmail({ ...DETAIL, can_approve: true }, 'approve')
    expect(subject).toBe('You earned credit for Entrepreneurship')
    expect(body).toContain('0.5 credit in Language Arts')
    expect(body.endsWith('This credit reflects steady, careful work. Well done.')).toBe(true)
  })
})

describe('withoutStockOpener', () => {
  it('drops a stock praise sentence when something specific follows', () => {
    expect(withoutStockOpener('This looks great! The pun in your slogan was clever.'))
      .toBe('The pun in your slogan was clever.')
    expect(withoutStockOpener('Really nice work on this comparison. The table made it clear.'))
      .toBe('The table made it clear.')
  })

  it('keeps a note that is only praise, and a note that starts specific', () => {
    expect(withoutStockOpener('This looks great!')).toBe('This looks great!')
    expect(withoutStockOpener('Your survey table is organized.')).toBe('Your survey table is organized.')
  })

  it('never repeats a stock line across the combined email', () => {
    const tasks = ['A', 'B', 'C'].map((name, i) => ({
      ...task(`c-${i}`, name, 'accepted', null),
      ai: { review: { feedback: { celebrate: `This looks great! Detail about ${name}.` } } },
    }))
    const { body } = composeClassReviewEmail({ ...DETAIL, tasks }, 'send_back')
    expect(body).not.toContain('This looks great')
    expect(body).toContain('Detail about B.')
  })
})

describe('ClassReviewEmail', () => {
  beforeEach(() => {
    api.post.mockClear()
    window.localStorage.clear()
  })

  it('sends nothing until Send is confirmed, then sends the edited draft', async () => {
    const onSent = vi.fn()
    render(withConfirm(<ClassReviewEmail detail={DETAIL} onSent={onSent} />))
    await screen.findByText(/To jake@example.com/)

    const message = screen.getByLabelText('Message')
    fireEvent.change(message, { target: { value: 'Hi Jake, one task to fix.' } })
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/class-reviews/q-1/send', {
      outcome: 'send_back',
      subject: 'Feedback on your class: Entrepreneurship',
      body: 'Hi Jake, one task to fix.',
    }))
    expect(onSent).toHaveBeenCalled()
  })

  it('sends the draft to the reviewer without finishing the review', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { to: 'tanner@example.com', email_sent: true } } })
    render(withConfirm(<ClassReviewEmail detail={DETAIL} />))
    fireEvent.click(screen.getByRole('button', { name: 'Send draft to me' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/class-reviews/q-1/send-preview',
      expect.objectContaining({ outcome: 'send_back', subject: 'Feedback on your class: Entrepreneurship' })))
    expect(api.post.mock.calls.some(([url]) => url.endsWith('/send'))).toBe(false)
  })

  it('offers approve only when every task is accepted', async () => {
    render(withConfirm(<ClassReviewEmail detail={DETAIL} />))
    expect(screen.getByRole('radio', { name: 'Approve credit' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Send class back' })).toHaveAttribute('aria-checked', 'true')
  })
})
