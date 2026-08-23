import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CrmConsole from '../CrmConsole'
import * as crmApi from '../crmApi'
import { withConfirm } from '../../../../tests/confirmTestUtils'

vi.mock('../crmApi', () => ({
  getOverview: vi.fn(),
  setFunnelStatus: vi.fn(),
  runSweep: vi.fn(),
  listFunnels: vi.fn(),
  getFunnel: vi.fn(),
  createFunnel: vi.fn(),
  updateFunnel: vi.fn(),
  deleteFunnel: vi.fn(),
  createStep: vi.fn(),
  updateStep: vi.fn(),
  deleteStep: vi.fn(),
  reorderSteps: vi.fn(),
  testSendStep: vi.fn(),
  listLeads: vi.fn(),
  createLead: vi.fn(),
  getLead: vi.fn(),
  convertLead: vi.fn(),
  exitLead: vi.fn(),
  moveLead: vi.fn(),
  addLeadNote: vi.fn(),
  listSuppressions: vi.fn(),
  addSuppression: vi.fn(),
  removeSuppression: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const renderConsole = (initialEntry = '/admin/crm') =>
  render(withConfirm(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/crm/*" element={<CrmConsole />} />
      </Routes>
    </MemoryRouter>
  ))

describe('CrmConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crmApi.getOverview.mockResolvedValue({ data: { summary: {}, funnels: [] } })
    crmApi.listLeads.mockResolvedValue({ data: { leads: [], total: 0 } })
    crmApi.listFunnels.mockResolvedValue({ data: { funnels: [] } })
    crmApi.listSuppressions.mockResolvedValue({ data: { suppressions: [], total: 0 } })
  })

  it('shows the three section tabs and redirects the index to funnels', async () => {
    renderConsole()
    expect(await screen.findByRole('tab', { name: 'Funnels' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Leads' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Suppressions' })).toBeInTheDocument()
    // Index redirected to the funnel overview
    expect(await screen.findByRole('heading', { name: 'Funnels' })).toBeInTheDocument()
    expect(crmApi.getOverview).toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Funnels' })).toHaveAttribute('aria-selected', 'true')
  })

  it('deep-links straight to the leads screen', async () => {
    renderConsole('/admin/crm/leads')
    expect(await screen.findByRole('heading', { name: 'Leads' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Leads' })).toHaveAttribute('aria-selected', 'true')
    expect(crmApi.getOverview).not.toHaveBeenCalled()
  })

  it('deep-links straight to the suppressions screen', async () => {
    renderConsole('/admin/crm/suppressions')
    expect(await screen.findByRole('heading', { name: 'Suppressions' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Suppressions' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })
})
