import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, HOUSEHOLD } = vi.hoisted(() => {
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
    HOUSEHOLD: household,
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
  // The balance due was a "Needs your attention" card on the family home until
  // 2026-09-16. It is the notice at the top of the household here now, and the
  // whole-family pay button sits inside it.
  it('puts the balance due as the notice at the top, with the pay button in it', async () => {
    api.get.mockResolvedValueOnce({ data: { households: [{
      ...HOUSEHOLD, organization: { ...HOUSEHOLD.organization, online_pay_enabled: true },
    }] } })
    render(<FamilyBillingPage />)
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('$700.00 balance due')
    expect(within(notice).getByText(/Pay whole family/)).toBeInTheDocument()
  })

  it('shows no notice when nothing is owed', async () => {
    api.get.mockResolvedValueOnce({ data: { households: [{
      ...HOUSEHOLD, totals: { invoiced_cents: 120000, paid_cents: 120000, balance_cents: 0 },
    }] } })
    render(<FamilyBillingPage />)
    await screen.findByText('Gryffin Microschool · Bowman Family')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders the balance summary and the how-to-pay note', async () => {
    render(<FamilyBillingPage />)
    expect(await screen.findByText('Gryffin Microschool · Bowman Family')).toBeInTheDocument()
    expect(screen.getByText('$1,200.00')).toBeInTheDocument()         // invoiced
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0)  // paid (summary + payment row)
    expect(screen.getAllByText('$700.00').length).toBeGreaterThan(0)  // balance (summary + invoice amount due)
    expect(screen.getByText(/Pay online, by Zelle, or through your scholarship program/)).toBeInTheDocument()
  })

  const QUESTION = {
    label: 'Form of Payment', help: 'I plan to pay with (select all that apply):', multi: true,
    options: ['Self-Pay', 'OpenED', 'Utah Fits All', 'Other Funding'],
  }
  const fundingHousehold = (over = {}) => ({
    household_id: 'hh1', household_name: 'Bowman Family',
    organization: { id: 'org-1', name: 'Gryffin Microschool', online_pay_enabled: true },
    funding_question: QUESTION,
    stated_payment_methods: ['Utah Fits All'], stated_ufa_private: null,
    funding_source: null, funding_label: null, pay_through_ufa: false,
    invoices: [], payments: [], totals: { invoiced_cents: 100000, paid_cents: 0, balance_cents: 100000 },
    ...over,
  })

  it('shows the funding source in the family\'s own words, large, with an edit button', async () => {
    api.get.mockResolvedValueOnce({ data: { households: [fundingHousehold()] } })
    render(<FamilyBillingPage />)
    expect(await screen.findByTestId('funding-source')).toHaveTextContent('Utah Fits All')
    expect(screen.getByLabelText('Edit funding source')).toBeInTheDocument()
    // The office never set the gate, so the family still sees card checkout.
    expect(screen.getByText(/Pay whole family/)).toBeInTheDocument()
  })

  it('edits from the school\'s own registration options and the gate follows the save', async () => {
    api.get.mockResolvedValueOnce({ data: { households: [fundingHousehold()] } })
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByLabelText('Edit funding source'))
    // The options are the registration question's, and the current answer is pre-checked.
    for (const option of QUESTION.options) expect(screen.getByLabelText(option)).toBeInTheDocument()
    expect(screen.getByLabelText('Utah Fits All')).toBeChecked()
    expect(screen.getByText(QUESTION.help)).toBeInTheDocument()
    // Utah Fits All is chosen, so the funnel's private-school follow-up appears.
    fireEvent.change(screen.getByLabelText(/UFA \(Utah Fits All\) Private School/), { target: { value: 'Yes' } })

    api.post.mockResolvedValueOnce({ data: {
      success: true, household_id: 'hh1', stated_payment_methods: ['Utah Fits All'], stated_ufa_private: true,
      funding_source: 'ufa_private', funding_label: 'UFA – Private School', pay_through_ufa: true,
    } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/parent/billing/funding-source', {
      household_id: 'hh1', payment_methods: ['Utah Fits All'], ufa_private: true,
    }))
    expect(await screen.findByTestId('funding-source')).toHaveTextContent('Utah Fits All (private school)')
    // UFA families pay through UFA, not by card.
    expect(screen.getByText(/make your payment through UFA/i)).toBeInTheDocument()
    expect(screen.queryByText(/Pay whole family/)).not.toBeInTheDocument()
  })

  it('allows more than one option when the question does, and drops the follow-up without UFA', async () => {
    api.get.mockResolvedValueOnce({ data: { households: [fundingHousehold({ funding_source: 'ufa', funding_label: 'UFA', pay_through_ufa: true })] } })
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByLabelText('Edit funding source'))
    fireEvent.click(screen.getByLabelText('Utah Fits All'))  // off
    fireEvent.click(screen.getByLabelText('Self-Pay'))
    fireEvent.click(screen.getByLabelText('OpenED'))
    expect(screen.queryByLabelText(/Private School/)).not.toBeInTheDocument()

    api.post.mockResolvedValueOnce({ data: {
      success: true, household_id: 'hh1', stated_payment_methods: ['Self-Pay', 'OpenED'], stated_ufa_private: null,
      funding_source: 'other', funding_label: 'Other', pay_through_ufa: false,
    } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/parent/billing/funding-source', {
      household_id: 'hh1', payment_methods: ['Self-Pay', 'OpenED'], ufa_private: null,
    }))
    expect(await screen.findByTestId('funding-source')).toHaveTextContent('Self-Pay, OpenED')
    expect(screen.getByText(/Pay whole family/)).toBeInTheDocument()
  })

  it('keeps the old value when the save fails, and cancel closes the editor', async () => {
    api.get.mockResolvedValueOnce({ data: { households: [fundingHousehold({ funding_source: 'ufa', funding_label: 'UFA', pay_through_ufa: true })] } })
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByLabelText('Edit funding source'))
    fireEvent.click(screen.getByLabelText('Self-Pay'))
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Not authorized to update this household' } } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    // Still editing, nothing changed underneath.
    expect(await screen.findByText('Cancel')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByTestId('funding-source')).toHaveTextContent('Utah Fits All')
    expect(screen.getByText(/make your payment through UFA/i)).toBeInTheDocument()
  })

  it('is read-only when the school has no payment question configured', async () => {
    api.get.mockResolvedValueOnce({ data: { households: [fundingHousehold({
      funding_question: null, stated_payment_methods: [], funding_source: 'private_pay', funding_label: 'Private Pay',
    })] } })
    render(<FamilyBillingPage />)
    expect(await screen.findByTestId('funding-source')).toHaveTextContent('Private Pay')
    expect(screen.queryByLabelText('Edit funding source')).not.toBeInTheDocument()
  })

  it('lists invoices with status and expands line items + installments', async () => {
    render(<FamilyBillingPage />)
    expect(await screen.findByText('Partially paid')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Robin Bowman invoice, $1,200.00' }))
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(screen.getAllByText('Amount due').length).toBe(2)  // header + expanded footer
    expect(screen.getByText('Payment schedule')).toBeInTheDocument()
    expect(screen.getByText('$600.00')).toBeInTheDocument()
    expect(screen.getByText('Late')).toBeInTheDocument()
    // A plain YYYY-MM-DD due date prints as that day, not the evening before it.
    expect(screen.getAllByText(/Jul 15, 2026/).length).toBeGreaterThan(0)
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

  // iCreate, ticket 03226ede (2026-09-24): families turn receipts in for
  // reimbursement and need "method of payment (card/check) and last four
  // digits of card number if paid by card".
  it('prints the card and its last four on a card receipt, and in the payment list', async () => {
    const card = { id: 'pay1', amount_cents: 50000, method: 'card', card_brand: 'visa',
      card_last4: '4242', external_ref: 'pi_1', recorded_at: '2026-07-05T00:00:00Z' }
    const base = api.get.getMockImplementation()
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/parent/billing/receipts/')) {
        return base(url).then((r) => ({ data: { receipt: { ...r.data.receipt, payment: card } } }))
      }
      if (url.includes('/api/sis/parent/billing')) {
        return Promise.resolve({ data: { households: [{ ...HOUSEHOLD, payments: [card] }] } })
      }
      return base(url)
    })
    try {
      render(<FamilyBillingPage />)
      expect(await screen.findByText(/Card \(Visa ending 4242\)/)).toBeInTheDocument()
      fireEvent.click(await screen.findByText('Print receipt'))
      expect(await screen.findByText('RECEIPT')).toBeInTheDocument()
      const method = screen.getByText('Method').closest('tr')
      expect(within(method).getByText('Card (Visa ending 4242)')).toBeInTheDocument()
    } finally {
      api.get.mockImplementation(base)
    }
  })

  it('prints a non-card method by its name on the receipt', async () => {
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByText('Print receipt'))
    expect(await screen.findByText('RECEIPT')).toBeInTheDocument()
    const method = screen.getByText('Method').closest('tr')
    expect(within(method).getByText('Zelle')).toBeInTheDocument()
  })

  it('prints a statement with a running balance', async () => {
    render(<FamilyBillingPage />)
    fireEvent.click(await screen.findByText('Print statement'))
    expect(await screen.findByText('STATEMENT')).toBeInTheDocument()
    expect(screen.getByText(/Balance due: \$700.00/)).toBeInTheDocument()
    await waitFor(() => expect(window.print).toHaveBeenCalled())
  })

  // Susan Miller, 2026-09-01: $3,035.00 tuition plus an $88.32 card fee, paid in
  // full by card, and this page told her she was $88.32 in credit. The fee sat
  // in processing_fee_cents, outside total_cents, and the balance summed totals.
  it('reads a paid card invoice as settled, not as a credit', async () => {
    const settled = {
      household_id: 'hh9',
      household_name: 'Miller Family',
      organization: { id: 'org-1', name: 'iCreate', logo_url: null },
      pay_through_ufa: false,
      invoices: [{
        id: 'inv9', status: 'paid', total_cents: 312332, amount_paid_cents: 312332,
        discount_cents: 0, processing_fee_cents: 8832,
        issued_at: '2026-08-28T00:00:00Z', student_name: 'Reese Miller',
        line_items: [
          { id: 'l1', description: 'Fall tuition', amount_cents: 303500, quantity: 1 },
          { id: 'l2', description: 'Card processing fee', amount_cents: 8832, quantity: 1 },
        ],
        installments: [], payments: [],
      }],
      payments: [],
      totals: { invoiced_cents: 312332, paid_cents: 312332, balance_cents: 0 },
    }
    api.get.mockResolvedValueOnce({ data: { households: [settled] } })
    render(<FamilyBillingPage />)
    // The whole bill, fee included — not the tuition with the fee hanging off it.
    expect(await screen.findByRole('button', { name: 'Reese Miller invoice, $3,123.32' })).toBeInTheDocument()
    // Settled: the card shows the whole bill as its total, and the balance is nothing.
    expect(screen.getAllByText('$3,123.32').length).toBeGreaterThan(0)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
    expect(screen.queryByText(/^-\$/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reese Miller invoice, $3,123.32' }))
    // Once, as a line item. It used to print again under the totals.
    expect(await screen.findAllByText('Card processing fee')).toHaveLength(1)
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

  it('allows the family to select a payment plan preference', async () => {
    api.get.mockImplementationOnce(() => Promise.resolve({ data: { households: [{
      household_id: 'hh1', household_name: 'Bowman Family',
      organization: { id: 'org-1', name: 'Gryffin Microschool' },
      pay_through_ufa: false, payment_plan_preference: null,
      invoices: [], payments: [], totals: { invoiced_cents: 0, paid_cents: 0, balance_cents: 0 },
    }] } }))
    render(<FamilyBillingPage />)
    expect(await screen.findByText('Tuition payment plan preference')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Monthly payments' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/parent/billing/payment-plan-preference', {
        household_id: 'hh1', payment_plan_preference: 'monthly',
      }))
  })
})
