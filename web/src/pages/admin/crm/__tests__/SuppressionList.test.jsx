import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import toast from 'react-hot-toast'
import SuppressionList from '../SuppressionList'
import * as crmApi from '../crmApi'
import { withConfirm } from '../../../../tests/confirmTestUtils'

/** Click a button inside the open confirmation dialog (labels are custom). */
const clickDialogButton = async (label) => {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: label }))
}

vi.mock('../crmApi', () => ({
  listSuppressions: vi.fn(),
  addSuppression: vi.fn(),
  removeSuppression: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const rows = [
  { id: 'sup1', email: 'gone@example.com', reason: 'unsubscribe', created_at: '2026-08-01T00:00:00Z' },
  { id: 'sup2', email: 'bounce@example.com', reason: 'hard_bounce', created_at: '2026-08-02T00:00:00Z' },
]

const renderList = () => render(withConfirm(<SuppressionList />))

describe('SuppressionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crmApi.listSuppressions.mockResolvedValue({ data: { suppressions: rows, total: 2 } })
    crmApi.addSuppression.mockResolvedValue({ data: {} })
    crmApi.removeSuppression.mockResolvedValue({ data: {} })
  })

  it('renders the suppression table', async () => {
    renderList()
    expect(await screen.findByText('gone@example.com')).toBeInTheDocument()
    expect(screen.getByText('unsubscribe')).toBeInTheDocument()
    expect(screen.getByText('hard_bounce')).toBeInTheDocument()
  })

  it('adds a manual suppression from the inline form', async () => {
    renderList()
    await screen.findByText('gone@example.com')
    fireEvent.change(screen.getByLabelText('Email to suppress'), {
      target: { value: 'Spam@Example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Suppress' }))
    await waitFor(() =>
      expect(crmApi.addSuppression).toHaveBeenCalledWith({
        email: 'spam@example.com',
        reason: 'manual',
      })
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it('does not post when the email box is empty', async () => {
    renderList()
    await screen.findByText('gone@example.com')
    expect(screen.getByRole('button', { name: 'Suppress' })).toBeDisabled()
    expect(crmApi.addSuppression).not.toHaveBeenCalled()
  })

  it('removes a suppression after confirmation', async () => {
    renderList()
    await screen.findByText('gone@example.com')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await clickDialogButton('Remove suppression')
    await waitFor(() => expect(crmApi.removeSuppression).toHaveBeenCalledWith('sup1'))
  })

  it('keeps the row when the removal is cancelled', async () => {
    renderList()
    await screen.findByText('gone@example.com')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await clickDialogButton('Cancel')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(crmApi.removeSuppression).not.toHaveBeenCalled()
  })

  it('shows the empty state when nothing is suppressed', async () => {
    crmApi.listSuppressions.mockResolvedValue({ data: { suppressions: [], total: 0 } })
    renderList()
    expect(await screen.findByText('No suppressed addresses')).toBeInTheDocument()
  })
})
