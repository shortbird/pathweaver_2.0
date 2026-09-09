import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import toast from 'react-hot-toast'
import FunnelOverview from '../FunnelOverview'
import * as crmApi from '../crmApi'
import { withConfirm } from '../../../../tests/confirmTestUtils'

/** Click a button inside the open confirmation dialog (labels are custom). */
const clickDialogButton = async (label) => {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: label }))
}

vi.mock('../crmApi', () => ({
  getOverview: vi.fn(),
  setFunnelStatus: vi.fn(),
  runSweep: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const overview = {
  summary: { active_leads: 12, sends_7d: 34, conversions_30d: 5, suppressed: 3 },
  postal_address_missing: true,
  funnels: [
    {
      id: 'f1',
      name: 'Free Class Nurture',
      key: 'free_class_nurture',
      status: 'active',
      funnel_type: 'nurture',
      entry_types: ['claim_free_class'],
      active_leads: 8,
      steps: [
        { id: 's1', step_order: 1, name: 'Welcome', is_active: true, active_leads: 5, sent: 20, opened: 8, clicked: 2 },
        { id: 's2', step_order: 2, name: 'Follow up', is_active: true, active_leads: 3, sent: 0, opened: null, clicked: null },
      ],
      exits: { converted: 4, completed: 2, unsubscribed: 1 },
    },
  ],
}

const renderOverview = () =>
  render(withConfirm(
    <MemoryRouter>
      <FunnelOverview />
    </MemoryRouter>
  ))

describe('FunnelOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crmApi.getOverview.mockResolvedValue({ data: overview })
    crmApi.setFunnelStatus.mockResolvedValue({ data: {} })
    crmApi.runSweep.mockResolvedValue({ data: {} })
  })

  it('renders the four summary tiles from one overview call', async () => {
    renderOverview()
    expect(await screen.findByText('Active leads')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Sends (7d)')).toBeInTheDocument()
    expect(screen.getByText('34')).toBeInTheDocument()
    expect(screen.getByText('Conversions (30d)')).toBeInTheDocument()
    expect(screen.getByText('Suppressed')).toBeInTheDocument()
    expect(crmApi.getOverview).toHaveBeenCalledTimes(1)
  })

  it('warns when the postal address is missing', async () => {
    renderOverview()
    expect(await screen.findByText('Postal address missing')).toBeInTheDocument()
  })

  it('does not warn when the postal address is set', async () => {
    crmApi.getOverview.mockResolvedValue({
      data: { ...overview, postal_address_missing: false },
    })
    renderOverview()
    await screen.findByText('Free Class Nurture')
    expect(screen.queryByText('Postal address missing')).not.toBeInTheDocument()
  })

  it('renders the funnel pipeline with per-step counts and dash for untracked metrics', async () => {
    renderOverview()
    expect(await screen.findByText('Free Class Nurture')).toBeInTheDocument()
    expect(screen.getByText('1. Welcome')).toBeInTheDocument()
    expect(screen.getByText('20 sent · 8 op · 2 cl')).toBeInTheDocument()
    // Step 2 has sent 0 and null tracking metrics
    expect(screen.getByText('0 sent · — op · — cl')).toBeInTheDocument()
  })

  it('links each step through to the filtered leads list', async () => {
    renderOverview()
    const stepLink = (await screen.findByText('1. Welcome')).closest('a')
    expect(stepLink).toHaveAttribute('href', '/admin/crm/leads?funnel_id=f1&step_id=s1')
  })

  it('pauses an active funnel after confirmation, with a body-carrying POST', async () => {
    renderOverview()
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await clickDialogButton('Pause funnel')
    await waitFor(() => expect(crmApi.setFunnelStatus).toHaveBeenCalledWith('f1', 'paused'))
    expect(toast.success).toHaveBeenCalled()
    // refetches the overview
    expect(crmApi.getOverview).toHaveBeenCalledTimes(2)
  })

  it('does not change status when the confirmation is cancelled', async () => {
    renderOverview()
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await clickDialogButton('Cancel')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(crmApi.setFunnelStatus).not.toHaveBeenCalled()
  })

  it('surfaces a failed status change as a toast error', async () => {
    crmApi.setFunnelStatus.mockRejectedValue({ response: { data: { error: 'nope' } } })
    renderOverview()
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await clickDialogButton('Pause funnel')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'))
  })

  it('runs the sweep after confirmation', async () => {
    renderOverview()
    fireEvent.click(await screen.findByRole('button', { name: 'Run sweep now' }))
    await clickDialogButton('Run sweep')
    await waitFor(() => expect(crmApi.runSweep).toHaveBeenCalled())
  })
})
