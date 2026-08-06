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
    pay_through_ufa: false,
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
      post: vi.fn(() => Promise.resolve({ data: { checkout_url: 'https://pay.example' } })),
    },
  }
})
vi.mock('../services/api', () => ({ default: api }))

import FamilyBillingPage from './FamilyBillingPage'

// A writable window.location stub so pay handlers can set href without jsdom navigating.
const stubLocation = () => {
  Object.defineProperty(window, 'location', {
    value: { origin: 'http://localhost', pathname: '/family/billing', href: '', search: '' },
    writable: true, configurable: true,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.print = vi.fn()
  stubLocation()
})

describe('FamilyBillingPage', () => {
  it('renders the balance summary and the how-to-pay note', async () => {
    render(<FamilyBillingPage />)
    expect(await screen.findByText('Gryffin Microschool · Bowman Family')).toBeInTheDocument()
    expect(screen.getByText('$1200.00')).toBeInTheDocument()          // invoiced
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0)  // paid (summary + payment row)
    expect(screen.getByText('$700.00')).toBeInTheDocument()           // balance
    expect(screen.getByText(/Pay online, by Zelle, or through your scholarship program/)).toBeInTheDocument()
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

  it('shows the pay-through-UFA message and hides card payment for a UFA family', async () => {
    api.get.mockImplementationOnce(() => Promise.resolve({ data: { households: [{
      household_id: 'hh2', household_name: 'Ford Family',
      organization: { id: 'org-1', name: 'iCreate', online_pay_enabled: true },
      pay_through_ufa: true, funding_label: 'UFA – Private School',
      invoices: [{ id: 'inv2', status: 'sent', total_cents: 475000, amount_paid_cents: 0,
        student_name: 'Uma', line_items: [], installments: [], payments: [] }],
      payments: [], totals: { invoiced_cents: 475000, paid_cents: 0, balance_cents: 475000 },
    }] } }))
    render(<FamilyBillingPage />)
    expect(await screen.findByText(/make your payment through UFA/i)).toBeInTheDocument()
    expect(screen.queryByText(/Pay whole family/)).not.toBeInTheDocument()
    expect(screen.queryByText(/online$/)).not.toBeInTheDocument()
  })

  it('offers whole-family payment and starts checkout', async () => {
    api.get.mockImplementationOnce(() => Promise.resolve({ data: { households: [{
      household_id: 'hh3', household_name: 'Lee Family',
      organization: { id: 'org-1', name: 'iCreate', online_pay_enabled: true },
      pay_through_ufa: false,
      invoices: [{ id: 'inv3', status: 'sent', total_cents: 60000, amount_paid_cents: 0,
        student_name: 'Ann', line_items: [], installments: [], payments: [] }],
      payments: [], totals: { invoiced_cents: 60000, paid_cents: 0, balance_cents: 60000 },
    }] } }))
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByText(/Pay whole family/))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/parent/billing/family-checkout',
        expect.objectContaining({ household_id: 'hh3' })))
  })

  it('starts a 10-payment plan on a payable invoice', async () => {
    api.get.mockImplementationOnce(() => Promise.resolve({ data: { households: [{
      household_id: 'hh3', household_name: 'Lee Family',
      organization: { id: 'org-1', name: 'iCreate', online_pay_enabled: true },
      pay_through_ufa: false,
      invoices: [{ id: 'inv3', status: 'sent', total_cents: 60000, amount_paid_cents: 0,
        student_name: 'Ann', line_items: [], installments: [], payments: [] }],
      payments: [], totals: { invoiced_cents: 60000, paid_cents: 0, balance_cents: 60000 },
    }] } }))
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByText('Set up 10-payment plan'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/parent/billing/invoices/inv3/autopay-setup',
        expect.objectContaining({ installment_count: 10 })))
  })
})
