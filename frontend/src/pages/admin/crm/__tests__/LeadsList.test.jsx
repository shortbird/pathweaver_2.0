import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LeadsList from '../LeadsList'
import * as crmApi from '../crmApi'

vi.mock('../crmApi', () => ({
  listLeads: vi.fn(),
  listFunnels: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const lead = {
  id: 'l1',
  email: 'jordan@example.com',
  first_name: 'Jordan',
  last_name: 'Rivera',
  status: 'active',
  // Real API shape: lead_type is the contact type the Source filter matches
  // on; lead_source is the intake channel (classes_lp / contact_form / ...).
  lead_type: 'claim_free_class',
  lead_source: 'classes_lp',
  funnel_name: 'Free Class Nurture',
  step_order: 3,
  total_steps: 6,
  entered_at: '2026-08-01T00:00:00Z',
  last_activity_at: '2026-08-10T00:00:00Z',
}

const renderList = (initialEntry = '/admin/crm/leads') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LeadsList />
    </MemoryRouter>
  )

describe('LeadsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    crmApi.listLeads.mockResolvedValue({ data: { leads: [lead], total: 1 } })
    crmApi.listFunnels.mockResolvedValue({
      data: { funnels: [{ id: 'f1', name: 'Free Class Nurture' }] },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders lead rows with email, funnel position and status', async () => {
    renderList()
    expect(await screen.findByText('jordan@example.com')).toBeInTheDocument()
    expect(screen.getByText('Jordan Rivera')).toBeInTheDocument()
    expect(screen.getByText(/step 3\/6/)).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    // The chip in the table row (the source filter select also carries the label)
    expect(within(screen.getByRole('table')).getByText('Free class claim')).toBeInTheDocument()
  })

  it('requests page 1 with the 25-per-page limit', async () => {
    renderList()
    await screen.findByText('jordan@example.com')
    expect(crmApi.listLeads).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 25 })
    )
  })

  it('reads filters from the query string (overview click-throughs deep-link)', async () => {
    renderList('/admin/crm/leads?funnel_id=f1&status=converted')
    await screen.findByText('jordan@example.com')
    expect(crmApi.listLeads).toHaveBeenCalledWith(
      expect.objectContaining({ funnel_id: 'f1', status: 'converted' })
    )
  })

  it('debounces the search box by 500ms before refetching', async () => {
    vi.useFakeTimers()
    renderList()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const initialCalls = crmApi.listLeads.mock.calls.length

    fireEvent.change(screen.getByLabelText('Search leads by email or name'), {
      target: { value: 'jordan' },
    })

    // Not yet - still inside the debounce window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(crmApi.listLeads).toHaveBeenCalledTimes(initialCalls)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(crmApi.listLeads).toHaveBeenCalledTimes(initialCalls + 1)
    expect(crmApi.listLeads).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'jordan' })
    )
  })

  it('refetches with the funnel filter when the select changes', async () => {
    renderList()
    await screen.findByText('jordan@example.com')
    fireEvent.change(screen.getByLabelText('Filter by funnel'), { target: { value: 'f1' } })
    await waitFor(() =>
      expect(crmApi.listLeads).toHaveBeenLastCalledWith(
        expect.objectContaining({ funnel_id: 'f1' })
      )
    )
  })

  it('shows the empty state when no leads match', async () => {
    crmApi.listLeads.mockResolvedValue({ data: { leads: [], total: 0 } })
    renderList()
    expect(await screen.findByText('No leads found')).toBeInTheDocument()
  })
})
