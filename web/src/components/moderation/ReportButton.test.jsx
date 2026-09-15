/**
 * ReportButton -- the flag on a friend's comment or a direct message.
 * Opens the reasons, files exactly one report, and thanks the reporter.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../services/api'
import ReportButton from './ReportButton'

vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }))
const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('@heroicons/react/24/outline', () => ({
  FlagIcon: (props) => <svg data-testid="flag" {...props} />,
}))

describe('ReportButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('files a report with the chosen reason', async () => {
    api.post.mockResolvedValue({ data: { success: true } })
    render(<ReportButton targetType="peer_comment" targetId="c1" label="Report this comment" />)
    await userEvent.click(screen.getByRole('button', { name: /report this comment/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /bullying or harassment/i }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/moderation/report',
        { target_type: 'peer_comment', target_id: 'c1', reason: 'harassment' })
    })
    expect(toast.success).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('cancel closes without a report', async () => {
    render(<ReportButton targetType="message" targetId="m1" />)
    await userEvent.click(screen.getByRole('button', { name: /report/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /cancel/i }))
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('reads the server error when the report fails', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Already reported' } } })
    render(<ReportButton targetType="message" targetId="m1" />)
    await userEvent.click(screen.getByRole('button', { name: /report/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /spam/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Already reported'))
  })
})
