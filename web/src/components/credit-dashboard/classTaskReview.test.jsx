/**
 * One task inside a class review: accept or send back with feedback, and take
 * the AI's recommendation whole. Accept posts to the class route, never to the
 * credit queue's approve (which would move subject XP).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import api from '../../services/api'
import ClassTaskReview from './ClassTaskReview'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const TASK = {
  completion_id: 'c-1',
  title: 'Write a Business Plan Executive Summary',
  description: 'Pick a business idea.',
  success_criteria: ['Names the business', 'Says why it will succeed'],
  xp_value: 100,
  subject_xp_attributed: 100,
  evidence_blocks: [],
  review: { state: 'pending', round_id: 'r-1' },
  ai: {
    status: 'complete',
    review: {
      recommendation: 'grow_this',
      confidence: 0.8,
      summary: 'The plan never says why it will succeed.',
      feedback: { grow_this: 'Add one paragraph on why customers will pay.' },
      criteria: [],
      evidence: [],
    },
  },
}

const renderTask = (overrides = {}) => {
  const onChanged = vi.fn()
  render(<ClassTaskReview questId="q-1" task={{ ...TASK, ...overrides }} canDecide onChanged={onChanged} />)
  return onChanged
}

describe('ClassTaskReview', () => {
  beforeEach(() => { api.post.mockClear() })

  it('shows the task state', () => {
    renderTask()
    expect(screen.getByText('Needs review')).toBeInTheDocument()
  })

  it('will not send a task back without feedback', () => {
    renderTask()
    expect(screen.getByRole('button', { name: 'Send back' })).toBeDisabled()
  })

  it('sends back with the typed feedback to the class route', async () => {
    const onChanged = renderTask()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Add your survey results.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send back' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/class-reviews/q-1/tasks/c-1/return',
      { feedback: 'Add your survey results.', ai_accepted: undefined }))
    expect(onChanged).toHaveBeenCalled()
  })

  it('accepts without feedback, never through the credit queue approve', async () => {
    renderTask()
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/class-reviews/q-1/tasks/c-1/accept',
      { feedback: undefined, ai_accepted: undefined }))
    expect(api.post.mock.calls.some(([url]) => url.includes('/approve'))).toBe(false)
  })

  it("takes the AI's send-back note whole", async () => {
    renderTask()
    fireEvent.click(screen.getByRole('button', { name: /Use the AI's call: send back, and add its note to the email/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/class-reviews/q-1/tasks/c-1/return',
      { feedback: 'Add one paragraph on why customers will pay.', ai_accepted: { feedback: 'grow_this' } }))
  })

  it('offers no decision once the class is decided', () => {
    render(<ClassTaskReview questId="q-1" task={{ ...TASK, review: { state: 'accepted' } }} canDecide={false} />)
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  })
})
