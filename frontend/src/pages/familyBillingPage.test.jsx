import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => {
  const household = {
    household_id: 'hh1',
    household_name: 'Bowman Family',
    organization: { id: 'org-1', name: 'Gryffin Microschool', logo_url: null },
    invoices: [{
      id: 'inv1', status: 'partial', total_cents: 120000, amount_paid_cents: 50000,
      discount_cents: 0, issued_at: '2026-07-01T00:00:00Z', due_date: '2026-07-15',
      student_name: 'Robin Bowman',
      line_items: [{ id: 'l1', description: 'Pottery', amount_cents: 120000, quantity: 1 }],
      installments: [{ id: 'i1', due_date: '2026-07-15', amount_cents: 60000, status: 'late' }],
      payments: [],
    }],
    payments: [{
      id: 'pay1', amount_cents: 50000, method: 'zelle', external_ref: 'Z-123',
      recorded_at: '2026-07-05T00:00:00Z',
    }],
    totals: { invoiced_cents: 120000, paid_cents: 50000, balance_cents: 70000 },
  }
  const receipt = {
    organization: { id: 'org-1', name: 'Gryffin Microschool', logo_url: null },
    payment: { id: 'pay1', amount_cents: 50000, method: 'zelle', external_ref: 'Z-123', recorded_at: '2026-07-05T00:00:00Z' },
    payer: { household_name: 'Bowman Family', guardian_name: 'Tanner Bowman' },
    students: ['Robin Bowman'],
    installment: null,
    invoice: {
      id: 'inv1', status: 'partial', total_cents: 120000, amount_paid_cents: 50000, discount_cents: 0,
      line_items: [{ id: 'l1', description: 'Pottery', amount_cents: 120000, quantity: 1 }],
    },
  }
  return {
    api: {
      get: vi.fn((url) => {
        if (url.includes('/api/sis/parent/billing/receipts/')) return Promise.resolve({ data: { receipt } })
        if (url.includes('/api/sis/parent/billing')) return Promise.resolve({ data: { households: [household] } })
        return Promise.resolve({ data: {} })
      }),
    },
  }
})
vi.mock('../services/api', () => ({ default: api }))

import FamilyBillingPage from './FamilyBillingPage'

beforeEach(() => {
  vi.clearAllMocks()
  window.print = vi.fn()
})

describe('FamilyBillingPage', () => {
  it('renders the balance summary and the how-to-pay note', async () => {
    render(<FamilyBillingPage />)
    expect(await screen.findByText('Gryffin Microschool · Bowman Family')).toBeInTheDocument()
    expect(screen.getByText('$1200.00')).toBeInTheDocument()          // invoiced
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0)  // paid (summary + payment row)
    expect(screen.getByText('$700.00')).toBeInTheDocument()           // balance
    expect(screen.getByText(/Pay by Zelle or through your scholarship program/)).toBeInTheDocument()
  })

  it('lists invoices with status and expands line items + installments', async () => {
    render(<FamilyBillingPage />)
    expect(await screen.findByText('partial')).toBeInTheDocument()
    fireEvent.click(screen.getByText('$1200.00 · Robin Bowman'))
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(screen.getByText('Payment schedule')).toBeInTheDocument()
    expect(screen.getByText('$600.00 · late')).toBeInTheDocument()
  })

  it('fetches a receipt and prints it', async () => {
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByText('Print receipt'))
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/sis/parent/billing/receipts/pay1'))
    expect(await screen.findByText('RECEIPT')).toBeInTheDocument()
    expect(screen.getByText(/recorded by Gryffin Microschool via Optio/i)).toBeInTheDocument()
    await waitFor(() => expect(window.print).toHaveBeenCalled())
  })

  it('prints a statement with a running balance', async () => {
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByText('Print statement'))
    expect(await screen.findByText('STATEMENT')).toBeInTheDocument()
    expect(screen.getByText(/Balance due: \$700.00/)).toBeInTheDocument()
    await waitFor(() => expect(window.print).toHaveBeenCalled())
  })

  it('shows an empty state when the family has no billing', async () => {
    api.get.mockResolvedValueOnce({ data: { households: [] } })
    render(<FamilyBillingPage />)
    expect(await screen.findByText(/No billing history yet/)).toBeInTheDocument()
  })
})
