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
      { class_id: 'c1', description: 'Piano', amount_cents: 10000 },
      { class_id: 'c2', description: 'Art', amount_cents: 5000 },
    ],
    subtotal_cents: 15000, discount_cents: 0, total_cents: 15000,
    already_invoiced: false, existing_invoice: null,
  })
  const apiData = (url) => {
    if (url.includes('/api/sis/tuition/queue')) {
      return { data: { students: [
        { student_id: 's1', name: 'Robin Bowman', household_name: 'Bowman Family',
          class_count: 2, estimated_total_cents: 15000, pay_through_ufa: false },
        { student_id: 's2', name: 'Uma Ford', household_name: 'Ford Family',
          class_count: 1, estimated_total_cents: 475000, pay_through_ufa: true },
      ], count: 2 } }
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
    expect(screen.getByText('UFA')).toBeInTheDocument() // Uma's UFA badge
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/tuition/queue'))
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
          { description: 'Piano', amount_cents: 10000, class_id: 'c1' },
          { description: 'Art', amount_cents: 4000, class_id: 'c2' },
        ],
        discount_cents: 0,
      })))
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
