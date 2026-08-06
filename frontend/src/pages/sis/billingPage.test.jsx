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
    if (url.includes('/api/sis/billing/ledger')) {
      return { data: { ledger: [{
        invoice_id: 'inv1', household_id: 'hh1', family_name: 'Bowman Family', student_name: 'Robin',
        description: 'Fall tuition', total_cents: 9000, amount_paid_cents: 0, balance_cents: 9000,
        status: 'sent', due_date: '2026-08-01', method: null, paid_at: null,
      }, {
        invoice_id: 'inv2', household_id: 'hh1', family_name: 'Bowman Family', student_name: 'Jay',
        description: 'Art supplies', total_cents: 4000, amount_paid_cents: 4000, balance_cents: 0,
        status: 'paid', due_date: '2026-07-01', method: 'zelle', paid_at: '2026-07-05',
      }] } }
    }
    if (url.includes('/api/sis/billing/outstanding')) {
      return { data: { outstanding: [{
        invoice_id: 'inv1', family_name: 'Bowman Family', student_name: 'Robin',
        status: 'overdue', due_date: '2026-07-01', total_cents: 9000, amount_paid_cents: 0,
        amount_due_cents: 9000, days_overdue: 12,
      }] } }
    }
    if (url.includes('/document')) {
      return { data: { document: {
        invoice_number: 'INV-2026-3B3796', status: 'sent', student_name: 'Robin',
        family: 'Bowman Family', due_date: '2026-08-01',
        organization: { name: 'iCreate', logo_url: null },
        line_items: [{ description: 'Reading Workshop (Tues Block 1)', amount_cents: 36500 }],
        subtotal_cents: 36500, discount_cents: 0, processing_fee_cents: 0,
        total_cents: 36500, amount_paid_cents: 0, amount_due_cents: 36500,
        funding_label: null,
      } } }
    }
    if (url.includes('/api/sis/households')) {
      return { data: { households: [{
        id: 'hh1', name: 'Bowman Family',
        members: [
          { user_id: 's1', name: 'Robin', relationship: 'student' },
          { user_id: 'g1', name: 'Tanner', relationship: 'guardian' },
        ],
      }] } }
    }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn((url) => Promise.resolve(
        url.includes('/reminders/run')
          ? { data: { success: true, checked: 3, reminded: 2, skipped: 1 } }
          : { data: { success: true, invoice: { id: 'inv9' } } }
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
  it('renders ledger rows with family, charge and status', async () => {
    render(<BillingPage />)
    expect(await screen.findByText('Fall tuition')).toBeInTheDocument()
    expect(screen.getAllByText('Bowman Family').length).toBeGreaterThan(0)
    expect(screen.getByText('$90.00')).toBeInTheDocument()
    expect(screen.getByText(/Paid/)).toBeInTheDocument() // paid pill with method
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/billing/ledger'))
  })

  it('adds a charge via the modal', async () => {
    render(<BillingPage />)
    await screen.findByText('Fall tuition')
    fireEvent.click(screen.getByText('+ Add charge'))

    // family picker (SearchSelect)
    fireEvent.focus(screen.getByPlaceholderText('Search families…'))
    fireEvent.mouseDown(await screen.findByText('Bowman Family', { selector: 'button' }))

    fireEvent.change(screen.getByPlaceholderText('e.g. Fall tuition'), { target: { value: 'Spring tuition' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add charge' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/billing/charges', expect.objectContaining({
        household_id: 'hh1', description: 'Spring tuition', amount_cents: 12000, organization_id: 'org-1',
      })))
  })

  it('records a payment via the modal', async () => {
    render(<BillingPage />)
    await screen.findByText('Fall tuition')
    fireEvent.click(screen.getByText('Record payment')) // row action for the outstanding row

    // modal open — submit button also reads "Record payment"
    const buttons = screen.getAllByText('Record payment')
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/invoices/inv1/payments', expect.objectContaining({
        amount_cents: 9000, method: 'zelle', organization_id: 'org-1',
      })))
  })

  it('shows the outstanding report on its tab', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Outstanding'))
    expect(await screen.findByText('Bowman Family')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument() // days overdue
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

/**
 * iCreate, 2026-08-06: "when I click a line on the /billing table I want to see
 * the invoice that was sent to them."
 *
 * Chasing a payment starts with "what did we actually send?", and the row only
 * ever showed a family, an amount and a status. The modal renders the same
 * branded document the family has in their portal, off the same endpoint — so
 * the office and the parent are looking at one artifact, not two summaries.
 */
describe('opening the invoice a family was sent', () => {
  it('opens from a row in the charges table', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Fall tuition'))
    expect(await screen.findByText('INV-2026-3B3796')).toBeInTheDocument()
    expect(screen.getByText('Reading Workshop (Tues Block 1)')).toBeInTheDocument()
  })

  it('opens from the outstanding report too', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Outstanding/i }))
    const rows = await screen.findAllByText('Bowman Family')
    fireEvent.click(rows[rows.length - 1])
    expect(await screen.findByText('INV-2026-3B3796')).toBeInTheDocument()
  })

  it('shows what the family owes, not just the total', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Fall tuition'))
    expect(await screen.findByText('Amount due')).toBeInTheDocument()
    expect(screen.getAllByText('$365.00').length).toBeGreaterThan(0)
  })

  it('does not open the invoice when Record payment is clicked', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Record payment'))
    // The payment modal opened; the invoice document was never fetched.
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/document'))
  })
})
