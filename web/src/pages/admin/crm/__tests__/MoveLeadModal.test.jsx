import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import MoveLeadModal from '../MoveLeadModal'
import * as crmApi from '../crmApi'

vi.mock('../crmApi', () => ({
  listFunnels: vi.fn(),
  getFunnel: vi.fn(),
  moveLead: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const lead = { id: 'l1', email: 'jordan@example.com' }

describe('MoveLeadModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crmApi.listFunnels.mockResolvedValue({
      data: { funnels: [{ id: 'f1', name: 'Free Class Nurture' }] },
    })
    crmApi.getFunnel.mockResolvedValue({
      data: {
        funnel: { id: 'f1', name: 'Free Class Nurture' },
        steps: [
          { id: 's1', step_order: 1, name: 'Welcome' },
          { id: 's2', step_order: 2, name: 'Follow up' },
        ],
      },
    })
    crmApi.moveLead.mockResolvedValue({ data: {} })
  })

  it('loads steps for the chosen funnel, then moves with funnel_id and step_order', async () => {
    const onMoved = vi.fn()
    render(<MoveLeadModal isOpen onClose={() => {}} lead={lead} onMoved={onMoved} />)

    const funnelSelect = await screen.findByLabelText('Funnel')
    await waitFor(() => expect(crmApi.listFunnels).toHaveBeenCalled())
    await screen.findByText('Free Class Nurture')
    fireEvent.change(funnelSelect, { target: { value: 'f1' } })

    await waitFor(() => expect(crmApi.getFunnel).toHaveBeenCalledWith('f1'))
    await screen.findByText('2. Follow up')
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: '2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Move lead' }))
    await waitFor(() =>
      expect(crmApi.moveLead).toHaveBeenCalledWith('l1', { funnel_id: 'f1', step_order: 2 })
    )
    expect(onMoved).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
  })

  it('disables the move button until a funnel and step are picked', async () => {
    render(<MoveLeadModal isOpen onClose={() => {}} lead={lead} />)
    const moveButton = await screen.findByRole('button', { name: 'Move lead' })
    expect(moveButton).toBeDisabled()
    fireEvent.click(moveButton)
    expect(crmApi.moveLead).not.toHaveBeenCalled()
  })

  it('surfaces a failed move as a toast error', async () => {
    crmApi.moveLead.mockRejectedValue({ response: { data: { error: 'lead is suppressed' } } })
    render(<MoveLeadModal isOpen onClose={() => {}} lead={lead} />)
    fireEvent.change(await screen.findByLabelText('Funnel'), { target: { value: 'f1' } })
    await screen.findByText('1. Welcome')
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move lead' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('lead is suppressed'))
  })
})
