import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'iCreate' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => {
  const preview = (url) => ({
    student: { id: 's1', name: 'Robin Bowman' },
    household_id: 'hh1', household_name: 'Bowman Family',
    funding_source: 'private_pay', funding_label: 'Private Pay', pay_through_ufa: false,
    tuition_plan: null, clp_finished: true,
    organization: { id: 'org-1', name: 'iCreate', logo_url: null },
    classes: [],
    line_items: [
      { class_id: 'c1', description: 'Piano', amount_cents: 10000, kind: 'tuition' },
      { class_id: 'c2', description: 'Art', amount_cents: 5000, kind: 'tuition' },
    ],
    subtotal_cents: 15000, discount_cents: 0, total_cents: 15000,
    already_invoiced: false, existing_invoice: null,
  })
  const apiData = (url) => {
    if (url.includes('/api/sis/tuition/queue')) {
      return { data: { students: [
        { student_id: 's1', name: 'Robin Bowman', household_name: 'Bowman Family',
          class_count: 2, estimated_total_cents: 15000, pay_through_ufa: false,
          stated_payment_methods: ['Self-Pay'], payment_plan: 'monthly' },
        { student_id: 's2', name: 'Uma Ford', household_name: 'Ford Family',
          class_count: 1, estimated_total_cents: 475000, pay_through_ufa: true,
          stated_payment_methods: ['Utah Fits All'], stated_ufa_private: true },
        { student_id: 's3', name: 'Alex Adams', household_name: 'Adams Family',
          class_count: 3, estimated_total_cents: 25000, pay_through_ufa: false,
          stated_payment_methods: [] },
      ], count: 3 } }
    }
    if (url.includes('/preview')) return { data: preview(url) }
    return { data: {} }
  }
  return {
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { success: true, emailed: 2, invoice: { id: 'inv9' } } })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

import TuitionApprovalPage from './TuitionApprovalPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'iCreate' } }
  vi.clearAllMocks()
})

describe('TuitionApprovalPage', () => {
  it('lists CLP-finished students awaiting an invoice, flagging UFA families', async () => {
    render(<TuitionApprovalPage />)
    expect(await screen.findByText('Robin Bowman')).toBeInTheDocument()
    expect(screen.getByText('Uma Ford')).toBeInTheDocument()
    expect(screen.getByText('$150.00')).toBeInTheDocument()
    // What each family said at registration — the question the office is
    // actually asking of this queue ("who is on UFA, and what do I send them?").
    expect(screen.getByText('Utah Fits All · Private School')).toBeInTheDocument()
    expect(screen.getAllByText('Self-Pay').length).toBeGreaterThan(0) // also a filter option
    expect(screen.getByText('Form of payment not answered')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/tuition/queue'))
  })

  it('filters students by search query and allows clearing search', async () => {
    render(<TuitionApprovalPage />)
    expect(await screen.findByText('Robin Bowman')).toBeInTheDocument()
    expect(screen.getByText('Uma Ford')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/Search name or family/i)
    fireEvent.change(searchInput, { target: { value: 'Ford' } })

    expect(screen.queryByText('Robin Bowman')).not.toBeInTheDocument()
    expect(screen.getByText('Uma Ford')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 3')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Clear filters'))
    expect(screen.getByText('Robin Bowman')).toBeInTheDocument()
    expect(screen.getByText('Uma Ford')).toBeInTheDocument()
  })

  // 2026-08-21 (Marika/Molly): "I need to be able to know if they are UFA or
  // not because that helps determine what I am sending when."
  it('narrows the queue to one form of payment', async () => {
    render(<TuitionApprovalPage />)
    expect(await screen.findByText('Uma Ford')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filter by form of payment'),
      { target: { value: 'Utah Fits All' } })
    expect(screen.getByText('Uma Ford')).toBeInTheDocument()
    expect(screen.queryByText('Robin Bowman')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 3')).toBeInTheDocument()
  })

  it('shows a family that chose monthly payments before the invoice goes out', async () => {
    render(<TuitionApprovalPage />)
    await screen.findByText('Robin Bowman')
    expect(screen.getByText('Monthly')).toBeInTheDocument()
  })

  it('sorts students by name (A-Z) and amount (High-Low)', async () => {
    render(<TuitionApprovalPage />)
    expect(await screen.findByText('Robin Bowman')).toBeInTheDocument()

    const sortSelect = screen.getByLabelText('Sort queue')

    // Sort Name (A-Z) -> Alex Adams first, then Robin Bowman, then Uma Ford
    fireEvent.change(sortSelect, { target: { value: 'name_asc' } })
    let buttons = screen.getAllByRole('button').filter(b => b.textContent.includes('classes') || b.textContent.includes('class'))
    expect(buttons[0]).toHaveTextContent('Alex Adams')
    expect(buttons[1]).toHaveTextContent('Robin Bowman')
    expect(buttons[2]).toHaveTextContent('Uma Ford')

    // Sort Amount (High-Low) -> Uma Ford ($4750.00) first, then Alex Adams ($250.00), then Robin Bowman ($150.00)
    fireEvent.change(sortSelect, { target: { value: 'amount_desc' } })
    buttons = screen.getAllByRole('button').filter(b => b.textContent.includes('classes') || b.textContent.includes('class'))
    expect(buttons[0]).toHaveTextContent('Uma Ford')
    expect(buttons[1]).toHaveTextContent('Alex Adams')
    expect(buttons[2]).toHaveTextContent('Robin Bowman')
  })

  it('loads the invoice preview with editable line items when a student is picked', async () => {
    render(<TuitionApprovalPage />)
    fireEvent.click(await screen.findByText('Robin Bowman'))
    // The two seeded lines show as editable description inputs.
    expect(await screen.findByDisplayValue('Piano')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Art')).toBeInTheDocument()
    // Total reflects the summed line amounts.
    expect(screen.getByRole('button', { name: /Send invoice · \$150\.00/ })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/tuition/students/s1/preview'))
  })

  it('sends the invoice with the (adjusted) line items', async () => {
    render(<TuitionApprovalPage />)
    fireEvent.click(await screen.findByText('Robin Bowman'))
    await screen.findByDisplayValue('Piano')
    // Adjust the Art line down to $40.
    fireEvent.change(screen.getByDisplayValue('50.00'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: /Send invoice/ }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/tuition/students/s1/invoice', expect.objectContaining({
        organization_id: 'org-1',
        line_items: [
          { description: 'Piano', amount_cents: 10000, class_id: 'c1', kind: 'tuition' },
          { description: 'Art', amount_cents: 4000, class_id: 'c2', kind: 'tuition' },
        ],
        discount_cents: 0,
      })))
  })

  // 2026-08-19: a supply-fee line typed in without a label was filtered out of
  // BOTH the preview and the invoice with no message, so iCreate emailed a
  // family the wrong amount and only found out afterwards.
  it('refuses to send a line that has money on it but no description', async () => {
    const { toast } = await import('react-hot-toast')
    render(<TuitionApprovalPage />)
    fireEvent.click(await screen.findByText('Robin Bowman'))
    await screen.findByDisplayValue('Piano')
    fireEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    const amounts = screen.getAllByDisplayValue('0.00')
    fireEvent.change(amounts[amounts.length - 1], { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: /Send invoice/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('$50.00')))
    expect(api.post).not.toHaveBeenCalled()
  })

  it('still ignores a line nobody has typed anything into', async () => {
    render(<TuitionApprovalPage />)
    fireEvent.click(await screen.findByText('Robin Bowman'))
    await screen.findByDisplayValue('Piano')
    fireEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    fireEvent.click(screen.getByRole('button', { name: /Send invoice/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/sis/tuition/students/s1/invoice',
      expect.objectContaining({ line_items: expect.arrayContaining([]) })))
    expect(api.post.mock.calls[0][1].line_items).toHaveLength(2)
  })

  it('shows the seeded supply fees as their own lines and totals them', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/preview')) {
        return Promise.resolve({ data: {
          student: { id: 's1', name: 'Robin Bowman' }, household_name: 'Bowman Family',
          organization: { name: 'iCreate' }, classes: [],
          line_items: [
            { class_id: 'c1', description: 'Piano', amount_cents: 10000, kind: 'tuition' },
            { class_id: 'c1', description: 'Piano — supplies', amount_cents: 4500, kind: 'supply' },
          ],
          subtotal_cents: 14500, total_cents: 14500, supply_total_cents: 4500,
          already_invoiced: false, existing_invoice: null,
        } })
      }
      return Promise.resolve({ data: { students: [
        { student_id: 's1', name: 'Robin Bowman', household_name: 'Bowman Family',
          class_count: 1, estimated_total_cents: 14500, supply_total_cents: 4500 },
      ], count: 1 } })
    })
    render(<TuitionApprovalPage />)
    fireEvent.click(await screen.findByText('Robin Bowman'))
    expect(await screen.findByDisplayValue('Piano — supplies')).toBeInTheDocument()
    expect(screen.getByText('of which class supply fees')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send invoice · \$145\.00/ })).toBeInTheDocument()
  })

  it('shows the pay-through-UFA note for a UFA family', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/preview')) {
        return Promise.resolve({ data: {
          student: { id: 's2', name: 'Uma Ford' }, household_name: 'Ford Family',
          funding_source: 'ufa_private', funding_label: 'UFA – Private School', pay_through_ufa: true,
          organization: { name: 'iCreate' }, classes: [],
          line_items: [{ class_id: null, description: 'iCreate Academy annual tuition', amount_cents: 475000 }],
          subtotal_cents: 475000, total_cents: 475000, already_invoiced: false, existing_invoice: null,
        } })
      }
      return Promise.resolve({ data: { students: [
        { student_id: 's2', name: 'Uma Ford', household_name: 'Ford Family',
          class_count: 1, estimated_total_cents: 475000, pay_through_ufa: true },
      ], count: 1 } })
    })
    render(<TuitionApprovalPage />)
    fireEvent.click(await screen.findByText('Uma Ford'))
    expect(await screen.findByText(/pays through UFA/i)).toBeInTheDocument()
  })
})
