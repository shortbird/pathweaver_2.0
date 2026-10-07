import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import CreditFeedbackThread from './CreditFeedbackThread'
import api from '../../services/api'

/**
 * Opening the thread clears unread teacher feedback.
 *
 * Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or
 * the inbox with a small badge, and students miss it." The quest banner goes
 * once the note is read, and read means the thread was opened.
 */

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }))
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { success: true, messages: [
    { id: 'm1', author_name: 'Dallin Bird', body: 'Label the vent.', is_mine: false },
  ] } })
  api.post.mockResolvedValue({ data: { success: true, marked: 1 } })
})

describe('CreditFeedbackThread mark read', () => {
  it('marks the completion read once loaded and tells the page', async () => {
    const onRead = vi.fn()
    render(<CreditFeedbackThread completionId="comp-1" markRead onRead={onRead} />)
    expect(await screen.findByText('Label the vent.')).toBeInTheDocument()
    await waitFor(() => expect(onRead).toHaveBeenCalledWith('comp-1'))
    expect(api.post).toHaveBeenCalledWith('/api/credit/comp-1/messages/read', {}, { expect403: true })
  })

  it('does not mark anything read without markRead (staff, parents, nothing new)', async () => {
    render(<CreditFeedbackThread completionId="comp-1" />)
    expect(await screen.findByText('Label the vent.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})
