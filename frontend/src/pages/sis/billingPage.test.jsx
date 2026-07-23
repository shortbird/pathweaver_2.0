import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/api/sis/billing/outstanding')) {
      return { data: { outstanding: [{
        invoice_id: 'inv1', family_name: 'Bowman Family', student_name: 'Robin',
        status: 'overdue', due_date: '2026-07-01', total_cents: 9000, amount_paid_cents: 0,
        amount_due_cents: 9000, days_overdue: 12,
        unpaid_installments: [{ id: 'i1', due_date: '2026-07-01', amount_cents: 4500, status: 'late' }],
      }] } }
    }
    if (url.includes('/api/sis/invoices/inv1')) {
      return { data: { invoice: {
        id: 'inv1', status: 'sent', total_cents: 9000, discount_cents: 1000, amount_paid_cents: 0,
        line_items: [{ id: 'l1', description: 'Pottery', amount_cents: 10000 }],
        payment_plans: [], payments: [],
      } } }
    }
    if (url.includes('/api/sis/invoices')) {
      return { data: { invoices: [{ id: 'inv1', status: 'sent', total_cents: 9000, discount_cents: 1000, amount_paid_cents: 0 }] } }
    }
    if (url.includes('/api/sis/discount-rules')) {
      return { data: { rules: [{ id: 'd1', name: 'Sibling 10%', rule_type: 'sibling', active: true }] } }
    }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn((url) => Promise.resolve(
        url.includes('/reminders/run')
          ? { data: { success: true, checked: 3, reminded: 2, skipped: 1 } }
          : { data: { rule: { id: 'd2' } } }
      )),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import BillingPage from './BillingPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

describe('BillingPage', () => {
  it('lists invoices and discount rules', async () => {
    render(<BillingPage />)
    expect(await screen.findByText('Sibling 10%')).toBeInTheDocument()
    expect(screen.getByText('$90.00')).toBeInTheDocument()
  })

  it('creates a discount rule with criteria', async () => {
    render(<BillingPage />)
    await screen.findByText('Sibling 10%')
    fireEvent.change(screen.getByPlaceholderText('Rule name'), { target: { value: 'Sibling' } })
    fireEvent.change(screen.getByPlaceholderText('% off'), { target: { value: '15' } })
    fireEvent.click(screen.getByText('Add rule'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/discount-rules', expect.objectContaining({
        rule_type: 'sibling', criteria: expect.objectContaining({ percent: 15, min_students: 2 }),
      })),
    )
  })

  it('opens an invoice and shows line items', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('$90.00'))
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(screen.getByText('Record payment')).toBeInTheDocument()
  })

  it('shows the outstanding report on its tab', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Outstanding'))
    expect(await screen.findByText('Bowman Family')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()           // days overdue
    expect(screen.getAllByText(/\$90\.00/).length).toBeGreaterThan(0) // amount due
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/billing/outstanding'))
  })

  it('sends payment reminders and reports counts', async () => {
    const { toast } = await import('react-hot-toast')
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Outstanding'))
    fireEvent.click(await screen.findByText('Send payment reminders'))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/billing/reminders/run', expect.objectContaining({ organization_id: expect.anything() })))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Reminders sent: 2')))
  })
})
