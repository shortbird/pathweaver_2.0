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
        processing_fee_cents: 0,
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
        family: { name: 'Bowman Family', address: null }, due_date: '2026-08-01',
        organization: { name: 'iCreate', logo_url: null },
        line_items: [{ description: 'Reading Workshop (Tues Block 1)', amount_cents: 36500 }],
        subtotal_cents: 36500, discount_cents: 0, processing_fee_cents: 0,
        total_cents: 36500, amount_paid_cents: 0, amount_due_cents: 36500,
        funding_label: null,
      } } }
    }
    if (url.includes('/api/sis/billing/detail')) {
      return { data: { report: {
        rows: [{
          invoice_id: 'inv1', invoice_number: 'INV-2026-3B3796', status: 'sent',
          family_name: 'Bowman Family', student_name: 'Robin',
          issued_at: '2026-08-01T00:00:00Z', due_date: '2026-09-01',
          description: 'Piano — supplies', kind: 'supply', amount_cents: 5000,
          invoice_total_cents: 15000, invoice_paid_cents: 0, invoice_balance_cents: 15000,
        }, {
          invoice_id: 'inv1', invoice_number: 'INV-2026-3B3796', status: 'sent',
          family_name: 'Bowman Family', student_name: 'Robin',
          issued_at: '2026-08-01T00:00:00Z', due_date: '2026-09-01',
          description: 'Piano', kind: 'tuition', amount_cents: 10000,
          invoice_total_cents: 15000, invoice_paid_cents: 0, invoice_balance_cents: 15000,
        }],
        payments: [{
          invoice_id: 'inv1', invoice_number: 'INV-2026-3B3796',
          family_name: 'Bowman Family', student_name: 'Robin',
          amount_cents: 5000, method: 'scholarship', note: 'UFA Ven',
          external_ref: null, recorded_at: '2026-08-10T00:00:00Z',
        }],
        totals: { charged_cents: 15000, paid_cents: 5000, balance_cents: 10000,
                  by_kind: { supply: 5000, tuition: 10000 } },
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
      patch: vi.fn(() => Promise.resolve({ data: { success: true, invoice: { id: 'inv1' } } })),
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

  // "I thought the $50 might be their reg fee" — a manual charge that does not
  // say what it is for cannot be reconciled against a bare UFA remittance.
  it('records what a manual charge is for', async () => {
    render(<BillingPage />)
    await screen.findByText('Fall tuition')
    fireEvent.click(screen.getByText('+ Add charge'))
    fireEvent.focus(screen.getByPlaceholderText('Search families…'))
    fireEvent.mouseDown(await screen.findByText('Bowman Family', { selector: 'button' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Fall tuition'), { target: { value: 'Registration' } })
    fireEvent.change(screen.getByLabelText('Charge type'), { target: { value: 'registration' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add charge' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/billing/charges', expect.objectContaining({
        description: 'Registration', kind: 'registration', amount_cents: 5000,
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

/**
 * iCreate, 2026-08-19. Three things went wrong on this page in one sitting.
 */
describe('correcting billing mistakes', () => {
  // The row called /api/sis/billing/invoices/<id>/document. That path has never
  // existed — the route is /api/sis/invoices/<id>/document — so every click on a
  // family returned "URL not found on server".
  it('fetches the invoice document from the path the server actually serves', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Fall tuition'))
    await screen.findByText('INV-2026-3B3796')
    const documentCalls = api.get.mock.calls.map(([url]) => url).filter((u) => u.includes('/document'))
    expect(documentCalls).toHaveLength(1)
    expect(documentCalls[0]).toContain('/api/sis/invoices/inv1/document')
    expect(documentCalls[0]).not.toContain('/billing/invoices')
  })

  // The document returns family as {name, address}. Rendering the object throws.
  it('renders the family name rather than the family object', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Fall tuition'))
    expect(await screen.findByText('INV-2026-3B3796')).toBeInTheDocument()
    expect(screen.getAllByText('Bowman Family').length).toBeGreaterThan(0)
  })

  // A "Processing fee" box sat next to the payment amount and silently PATCHed
  // the invoice. Three invoices were saved with a fee equal to the whole
  // tuition; the office saw "Paid" and the families were billed twice.
  it('cannot change the invoice while recording a payment', async () => {
    render(<BillingPage />)
    await screen.findByText('Fall tuition')
    fireEvent.click(screen.getByText('Record payment'))
    expect(screen.queryByLabelText(/processing fee/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Processing fee \(\$\)/)).not.toBeInTheDocument()
    const buttons = screen.getAllByText('Record payment')
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.patch).not.toHaveBeenCalled()
  })

  // "How do I change an invoice. I just sent the wrong amount to someone."
  it('edits a sent invoice in place, keeping its number', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Fall tuition'))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(await screen.findByLabelText('Line 1 amount'), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save invoice' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/invoices/inv1', expect.objectContaining({
        organization_id: 'org-1',
        line_items: [expect.objectContaining({ amount_cents: 30000 })],
      })))
  })

  it('will not save an edit that leaves a charge unnamed', async () => {
    const { toast } = await import('react-hot-toast')
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Fall tuition'))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(await screen.findByLabelText('Line 1 description'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save invoice' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Name the')))
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('voids an unpaid invoice', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByText('Fall tuition'))
    fireEvent.click(await screen.findByRole('button', { name: 'Void' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/invoices/inv1/void',
        { organization_id: 'org-1' }))
  })
})

/**
 * iCreate, 2026-08-19: "with payments coming in from UFA, it is hard to decipher
 * on the UFA end of things what they are paying for."
 *
 * UFA remits an amount and no statement of what it covers. This tab lists every
 * charge line beside the payments recorded against it, so a $50 deposit is
 * looked up rather than guessed at.
 */
describe('charge detail', () => {
  it('lists each charge with what kind of charge it is', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Charge detail' }))
    expect(await screen.findByText('Piano — supplies')).toBeInTheDocument()
    // getAllBy: the same words label the filter's options as well as the pills.
    expect(screen.getAllByText('Supplies').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tuition').length).toBeGreaterThan(0)
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/billing/detail'))
  })

  it('lists the payments recorded against those charges', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Charge detail' }))
    expect(await screen.findByText('Payments recorded')).toBeInTheDocument()
    expect(screen.getByText('UFA Ven')).toBeInTheDocument()
    expect(screen.getByText('Scholarship')).toBeInTheDocument()
  })

  it('narrows to one kind of charge', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Charge detail' }))
    await screen.findByText('Piano — supplies')
    fireEvent.change(screen.getByLabelText('Charge type'), { target: { value: 'supply' } })
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('kind=supply')))
  })

  it('opens the invoice a charge sits on', async () => {
    render(<BillingPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Charge detail' }))
    fireEvent.click(await screen.findByText('Piano — supplies'))
    expect(await screen.findByText('Reading Workshop (Tues Block 1)')).toBeInTheDocument()
  })
})
