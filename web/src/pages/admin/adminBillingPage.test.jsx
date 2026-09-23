import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import api from '../../services/api'
import AdminBillingPage from './AdminBillingPage'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

const ORGS = [
  { id: 'org-h', name: 'Hearthwood', slug: 'hearthwood', is_active: true },
  { id: 'org-a', name: 'Arete', slug: 'arete', is_active: true },
  { id: 'org-i1', name: 'iCreate', slug: 'icreate', is_active: true },
  { id: 'org-i2', name: 'iCreate', slug: 'icreate-2', is_active: true },
  { id: 'org-old', name: 'Lily Lake', slug: 'lily-lake', is_active: false, archived_at: '2026-01-01' },
]

const HEARTHWOOD_INVOICE = {
  id: 'in_1', number: 'OPT-1', status: 'overdue', total_cents: 5000, created: '2026-09-01',
  due_date: '2026-09-15', organization_id: 'org-h', recipient_email: 'books@hearthwood.test',
  recipient_name: 'Hearthwood Office',
}
const PAID_INVOICE = {
  id: 'in_2', number: 'OPT-2', status: 'paid', paid_via: 'bank', total_cents: 7000, created: '2026-08-01',
  due_date: '2026-08-31', organization_id: null, recipient_email: 'pat@consult.test', recipient_name: null,
}

const listing = (invoices = []) => ({
  data: { invoices, default_days_until_due: 30 },
})

// The org list and the invoice list are the page's two reads.
const serve = (invoices = []) => api.get.mockImplementation((url) =>
  Promise.resolve(url === '/api/admin/organizations' ? { data: { organizations: ORGS } } : listing(invoices)))

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AdminBillingPage />
  </QueryClientProvider>
)

describe('AdminBillingPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends an invoice to anyone, in cents, with no org when none is picked', async () => {
    serve()
    api.post.mockResolvedValue({ data: {} })
    mount()

    expect(await screen.findByText(/bank transfer \(ACH\) at no cost/)).toBeInTheDocument()
    expect(screen.queryByText(/card/i)).toBeNull()
    await userEvent.type(screen.getByLabelText('Recipient email'), 'pat@consult.test')
    await userEvent.type(screen.getByLabelText('Description'), 'Workshop')
    await userEvent.type(screen.getByLabelText('Amount'), '1,250.50')
    await userEvent.clear(screen.getByLabelText('Quantity'))
    await userEvent.type(screen.getByLabelText('Quantity'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Send invoice' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Send \$2,501.00 invoice/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }))

    expect(api.post).toHaveBeenCalledWith('/api/admin/billing/invoices', {
      recipient_email: 'pat@consult.test',
      recipient_name: '',
      organization_id: null,
      lines: [{ description: 'Workshop', amount_cents: 125050, quantity: 2 }],
      memo: '',
      days_until_due: 30,
    })
  })

  it('picking an org links it and fills the recipient it was billed at last time', async () => {
    serve([HEARTHWOOD_INVOICE])
    mount()
    await screen.findByText('OPT-1')
    await userEvent.selectOptions(screen.getByLabelText('Organization (optional)'), 'org-h')
    expect(screen.getByLabelText('Recipient email')).toHaveValue('books@hearthwood.test')
    expect(screen.getByLabelText('Bill to (name on invoice)')).toHaveValue('Hearthwood Office')
  })

  it('will not send without a recipient', async () => {
    serve()
    mount()
    await userEvent.type(await screen.findByLabelText('Description'), 'Licenses')
    await userEvent.type(screen.getByLabelText('Amount'), '100')
    expect(screen.getByRole('button', { name: 'Send invoice' })).toBeDisabled()
  })

  it('lists recipients and org links, with actions only on unpaid invoices', async () => {
    serve([HEARTHWOOD_INVOICE, PAID_INVOICE])
    mount()
    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getByText('Hearthwood')).toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: 'Void' })).toBeInTheDocument()
    expect(within(rows[2]).getByText('pat@consult.test')).toBeInTheDocument()
    expect(within(rows[2]).queryByRole('button', { name: 'Void' })).toBeNull()
    expect(within(rows[2]).getByText('by bank transfer')).toBeInTheDocument()
  })

  it('offers every org, archived ones included, and tells same-named orgs apart', async () => {
    serve()
    mount()
    await screen.findAllByText('Lily Lake [archived]', { selector: 'option' })
    expect(api.get).toHaveBeenCalledWith('/api/admin/organizations', { params: { include_archived: true } })
    const picker = screen.getByLabelText('Organization (optional)')
    const names = [...picker.querySelectorAll('option')].map(o => o.textContent)
    expect(names).toEqual(['None', 'Arete', 'Hearthwood', 'iCreate (icreate-2)', 'iCreate (icreate)', 'Lily Lake [archived]'])
  })

  it('the filter asks the server for one org', async () => {
    serve([HEARTHWOOD_INVOICE])
    mount()
    await screen.findByText('OPT-1')
    await userEvent.selectOptions(screen.getByLabelText('Filter by organization'), 'org-h')
    expect(api.get).toHaveBeenCalledWith('/api/admin/billing/invoices', { params: { organization_id: 'org-h' } })
  })
})
