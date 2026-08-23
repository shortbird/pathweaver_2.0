import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import toast from 'react-hot-toast'
import FunnelEditor from '../FunnelEditor'
import * as crmApi from '../crmApi'
import { withConfirm } from '../../../../tests/confirmTestUtils'

/** Click a button inside the open confirmation dialog (labels are custom). */
const clickDialogButton = async (label) => {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: label }))
}

vi.mock('../crmApi', () => ({
  getFunnel: vi.fn(),
  createFunnel: vi.fn(),
  updateFunnel: vi.fn(),
  createStep: vi.fn(),
  updateStep: vi.fn(),
  deleteStep: vi.fn(),
  reorderSteps: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const funnelResponse = {
  funnel: {
    id: 'f1',
    name: 'Free Class Nurture',
    description: 'Nurtures free-class leads',
    status: 'active',
    funnel_type: 'nurture',
    entry_types: ['claim_free_class'],
    active_leads: 2,
  },
  steps: [
    { id: 's1', step_order: 1, name: 'Welcome', delay_hours: 1, is_active: true },
    { id: 's2', step_order: 2, name: 'Follow up', delay_hours: 48, is_active: true },
  ],
}

const renderEditor = (initialEntry = '/admin/crm/funnels/f1') =>
  render(withConfirm(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/crm/funnels/new" element={<FunnelEditor />} />
        <Route path="/admin/crm/funnels/:funnelId" element={<FunnelEditor />} />
      </Routes>
    </MemoryRouter>
  ))

describe('FunnelEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crmApi.getFunnel.mockResolvedValue({ data: funnelResponse })
    crmApi.updateFunnel.mockResolvedValue({ data: {} })
    crmApi.createFunnel.mockResolvedValue({ data: { funnel: { id: 'f-new' } } })
    crmApi.createStep.mockResolvedValue({ data: { step: { id: 's-new' } } })
    crmApi.updateStep.mockResolvedValue({ data: {} })
    crmApi.deleteStep.mockResolvedValue({ data: {} })
    crmApi.reorderSteps.mockResolvedValue({ data: {} })
  })

  it('loads the funnel into the form and lists its steps in order', async () => {
    renderEditor()
    expect(await screen.findByLabelText('Name')).toHaveValue('Free Class Nurture')
    expect(screen.getByLabelText('Step 1 name')).toHaveValue('Welcome')
    expect(screen.getByLabelText('Step 2 name')).toHaveValue('Follow up')
    // 48h shows as 2 days by default
    expect(screen.getByLabelText('Step 2 delay')).toHaveValue(2)
    expect(screen.getByLabelText('Step 2 delay unit')).toHaveValue('days')
    expect(screen.getByLabelText('Step 1 delay unit')).toHaveValue('hours')
  })

  it('warns when leads are mid-funnel', async () => {
    renderEditor()
    expect(await screen.findByText('2 leads mid-funnel')).toBeInTheDocument()
  })

  it('saves the funnel basics with entry types in one PUT', async () => {
    renderEditor()
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByLabelText(/Families/))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(crmApi.updateFunnel).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({
          name: 'Free Class Nurture',
          entry_types: ['claim_free_class', 'families'],
        })
      )
    )
    expect(toast.success).toHaveBeenCalledWith('Funnel saved')
  })

  it('normalizes a days delay back to delay_hours when saving an edited step', async () => {
    renderEditor()
    await screen.findByLabelText('Name')
    fireEvent.change(screen.getByLabelText('Step 2 delay'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(crmApi.updateStep).toHaveBeenCalledWith(
        's2',
        expect.objectContaining({ delay_hours: 72 })
      )
    )
  })

  it('offers a confirmed steal retry on an entry-type 409 conflict', async () => {
    crmApi.updateFunnel
      .mockRejectedValueOnce({
        response: { status: 409, data: { error: null, conflict_funnel_name: 'General Interest' } },
      })
      .mockResolvedValue({ data: {} })
    renderEditor()
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.error.mock.calls[0][0]).toContain('General Interest')
    await clickDialogButton('Steal entry types')
    await waitFor(() =>
      expect(crmApi.updateFunnel).toHaveBeenLastCalledWith(
        'f1',
        expect.objectContaining({ steal: true })
      )
    )
  })

  it('does not retry with steal when the conflict confirm is cancelled', async () => {
    crmApi.updateFunnel.mockRejectedValueOnce({
      response: { status: 409, data: { conflict_funnel_name: 'General Interest' } },
    })
    renderEditor()
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await clickDialogButton('Cancel')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(crmApi.updateFunnel).toHaveBeenCalledTimes(1)
  })

  it('reorders steps with the full ordered id list', async () => {
    renderEditor()
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByLabelText('Move step 1 down'))
    await waitFor(() => expect(crmApi.reorderSteps).toHaveBeenCalledWith('f1', ['s2', 's1']))
  })

  it('removes a step after confirmation', async () => {
    renderEditor()
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByLabelText('Remove step 1'))
    await clickDialogButton('Remove step')
    await waitFor(() => expect(crmApi.deleteStep).toHaveBeenCalledWith('s1'))
  })

  it('offers deactivate when deleting a step with send history (409)', async () => {
    crmApi.deleteStep.mockRejectedValue({ response: { status: 409, data: {} } })
    renderEditor()
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByLabelText('Remove step 1'))
    await clickDialogButton('Remove step')
    // second dialog: deactivate instead
    expect(await screen.findByText('This step has send history')).toBeInTheDocument()
    await clickDialogButton('Deactivate step')
    await waitFor(() => expect(crmApi.updateStep).toHaveBeenCalledWith('s1', { is_active: false }))
  })

  it('adds a step with placeholder content and navigates to its editor', async () => {
    renderEditor()
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    await waitFor(() =>
      expect(crmApi.createStep).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({
          name: 'Step 3',
          html_body: expect.any(String),
          delay_hours: 96,
          is_active: false,
        })
      )
    )
  })

  it('creates a funnel in new mode and disables steps until saved', async () => {
    renderEditor('/admin/crm/funnels/new')
    expect(await screen.findByText('Save the funnel first, then add steps.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Onboarding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create funnel' }))
    await waitFor(() =>
      expect(crmApi.createFunnel).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Onboarding', status: 'paused' })
      )
    )
  })

  it('refuses to save without a name', async () => {
    renderEditor('/admin/crm/funnels/new')
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Create funnel' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The funnel needs a name'))
    expect(crmApi.createFunnel).not.toHaveBeenCalled()
  })
})
