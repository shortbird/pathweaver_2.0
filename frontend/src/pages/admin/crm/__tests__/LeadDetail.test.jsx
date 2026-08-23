import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import toast from 'react-hot-toast'
import LeadDetail from '../LeadDetail'
import * as crmApi from '../crmApi'
import { withConfirm } from '../../../../tests/confirmTestUtils'

/** Click a button inside the open confirmation dialog (labels are custom). */
const clickDialogButton = async (label) => {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: label }))
}

vi.mock('../crmApi', () => ({
  getLead: vi.fn(),
  convertLead: vi.fn(),
  exitLead: vi.fn(),
  addLeadNote: vi.fn(),
  addSuppression: vi.fn(),
  // used by MoveLeadModal
  listFunnels: vi.fn(),
  getFunnel: vi.fn(),
  moveLead: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const leadResponse = {
  lead: {
    id: 'l1',
    email: 'jordan@example.com',
    first_name: 'Jordan',
    last_name: 'Rivera',
    status: 'active',
    lead_source: 'demo',
    created_at: '2026-08-01T00:00:00Z',
  },
  membership: {
    funnel_name: 'Free Class Nurture',
    step_order: 3,
    total_steps: 6,
    next_send_at: '2026-08-23T10:00:00Z',
  },
  timeline: [
    { id: 'e1', type: 'entered', funnel_name: 'Free Class Nurture', created_at: '2026-08-01T00:00:00Z' },
    {
      id: 'e2',
      type: 'send',
      step_name: 'Welcome',
      subject: 'Welcome to Optio',
      sent_at: '2026-08-02T00:00:00Z',
      opened_at: '2026-08-02T01:00:00Z',
      bounce_reason: null,
      created_at: '2026-08-02T00:00:00Z',
    },
    { id: 'e3', type: 'note', body: 'Spoke on the phone', created_at: '2026-08-03T00:00:00Z' },
  ],
}

const renderDetail = () =>
  render(withConfirm(
    <MemoryRouter initialEntries={['/admin/crm/leads/l1']}>
      <Routes>
        <Route path="/admin/crm/leads/:leadId" element={<LeadDetail />} />
      </Routes>
    </MemoryRouter>
  ))

describe('LeadDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crmApi.getLead.mockResolvedValue({ data: leadResponse })
    crmApi.convertLead.mockResolvedValue({ data: {} })
    crmApi.exitLead.mockResolvedValue({ data: {} })
    crmApi.addLeadNote.mockResolvedValue({ data: {} })
    crmApi.addSuppression.mockResolvedValue({ data: {} })
    crmApi.listFunnels.mockResolvedValue({ data: { funnels: [] } })
  })

  it('renders the header, funnel state card and timeline', async () => {
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'jordan@example.com' })).toBeInTheDocument()
    expect(screen.getByText('Step 3 of 6')).toBeInTheDocument()
    expect(screen.getByText('Free Class Nurture')).toBeInTheDocument()
    // Send node: subject + open state; note body
    expect(screen.getByText('Welcome to Optio')).toBeInTheDocument()
    expect(screen.getByText('opened')).toBeInTheDocument()
    expect(screen.getByText('Spoke on the phone')).toBeInTheDocument()
  })

  it('shows the bounce reason in red on bounced sends', async () => {
    crmApi.getLead.mockResolvedValue({
      data: {
        ...leadResponse,
        timeline: [
          {
            id: 'e2',
            type: 'send',
            step_name: 'Welcome',
            subject: 'Welcome',
            sent_at: '2026-08-02T00:00:00Z',
            bounce_reason: 'Mailbox does not exist',
            created_at: '2026-08-02T00:00:00Z',
          },
        ],
      },
    })
    renderDetail()
    const reason = await screen.findByText('Mailbox does not exist')
    expect(reason).toHaveClass('text-red-600')
    expect(screen.getByText('bounced')).toBeInTheDocument()
  })

  it('marks the lead converted after confirmation and refetches', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Mark converted' }))
    await clickDialogButton('Mark converted')
    await waitFor(() => expect(crmApi.convertLead).toHaveBeenCalledWith('l1'))
    expect(crmApi.getLead).toHaveBeenCalledTimes(2)
  })

  it('removes the lead from its funnel after confirmation', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from funnel' }))
    await clickDialogButton('Remove from funnel')
    await waitFor(() => expect(crmApi.exitLead).toHaveBeenCalledWith('l1'))
  })

  it('does nothing when the destructive confirmation is cancelled', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from funnel' }))
    await clickDialogButton('Cancel')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(crmApi.exitLead).not.toHaveBeenCalled()
  })

  it('suppresses the lead email with reason manual', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Suppress email' }))
    await clickDialogButton('Suppress email')
    await waitFor(() =>
      expect(crmApi.addSuppression).toHaveBeenCalledWith({
        email: 'jordan@example.com',
        reason: 'manual',
      })
    )
  })

  it('adds a note and clears the textarea', async () => {
    renderDetail()
    const textarea = await screen.findByLabelText('Add note')
    fireEvent.change(textarea, { target: { value: 'Great call today' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(crmApi.addLeadNote).toHaveBeenCalledWith('l1', 'Great call today'))
    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('surfaces action failures as toast errors', async () => {
    crmApi.convertLead.mockRejectedValue({ response: { data: { error: 'already converted' } } })
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Mark converted' }))
    await clickDialogButton('Mark converted')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('already converted'))
  })

  it('opens the move modal from the actions card', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Move to funnel step' }))
    expect(await screen.findByRole('heading', { name: 'Move lead' })).toBeInTheDocument()
    expect(crmApi.listFunnels).toHaveBeenCalled()
  })
})
