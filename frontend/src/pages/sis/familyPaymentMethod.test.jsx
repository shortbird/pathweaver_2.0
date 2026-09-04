/**
 * "What happened to the ability to see what method of payment the family plans
 * to use?" — Marika and Molly, iCreate, 2026-08-21.
 *
 * The answer was on file the whole time: every family picks a Form of Payment
 * in the registration funnel. It was only ever read back on the CLP page, so
 * the office — invoicing, needing to know who is on Utah Fits All — could not
 * see it on the Families list or the tuition approver.
 *
 * These cover the family-facing answer appearing where staff work, and the
 * payment plan (in full vs monthly) they can now record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// These SIS pages read their data through hooks/api (QF-03), so they need a
// QueryClient. A fresh client per render keeps one test's cache out of the
// next one's; retry:false makes a failed query fail the assertion rather than
// hang through three backoff rounds.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'org_admin' } }),
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/ConfirmContext', () => ({ useConfirm: () => () => Promise.resolve(true) }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const HOUSEHOLDS = [
  { id: 'h1', name: 'Ford Family', members: [{ user_id: 's1', name: 'Uma Ford', relationship: 'student' }],
    stated_payment_methods: ['Utah Fits All'], stated_ufa_private: false, payment_plan: null },
  { id: 'h2', name: 'Bowman Family', members: [{ user_id: 's2', name: 'Robin Bowman', relationship: 'student' }],
    stated_payment_methods: ['Self-Pay'], stated_ufa_private: null, payment_plan: 'monthly' },
  { id: 'h3', name: 'Older Family', members: [],
    stated_payment_methods: [], stated_ufa_private: null, payment_plan: null },
]

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import HouseholdsPage from './HouseholdsPage'
import FamilyDetailModal from './FamilyDetailModal'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/api/sis/households')) return Promise.resolve({ data: { households: HOUSEHOLDS } })
    if (url.includes('/api/sis/unassigned-students')) return Promise.resolve({ data: { students: [] } })
    if (url.includes('registration')) return Promise.resolve({ data: { registration: null } })
    return Promise.resolve({ data: {} })
  })
})

describe('Families list — form of payment', () => {
  it('shows what each family said they would pay with', async () => {
    render(<HouseholdsPage />)
    expect(await screen.findByText('Ford Family')).toBeInTheDocument()
    // getAllByText: the filter dropdown lists the same answers as options.
    expect(screen.getAllByText('Utah Fits All').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Self-Pay').length).toBeGreaterThan(0)
    // A family who registered before the question existed reads as unanswered
    // rather than as having no method.
    expect(screen.getByText('Not answered')).toBeInTheDocument()
  })

  it('shows a family who chose monthly payments', async () => {
    render(<HouseholdsPage />)
    await screen.findByText('Bowman Family')
    expect(screen.getByText('Monthly')).toBeInTheDocument()
  })

  it('narrows the list to one form of payment', async () => {
    render(<HouseholdsPage />)
    await screen.findByText('Ford Family')
    fireEvent.change(screen.getByLabelText('Filter by form of payment'),
      { target: { value: 'Utah Fits All' } })
    expect(screen.getByText('Ford Family')).toBeInTheDocument()
    expect(screen.queryByText('Bowman Family')).not.toBeInTheDocument()
    expect(screen.queryByText('Older Family')).not.toBeInTheDocument()
  })

  it('can list only the families who never answered', async () => {
    render(<HouseholdsPage />)
    await screen.findByText('Ford Family')
    fireEvent.change(screen.getByLabelText('Filter by form of payment'),
      { target: { value: '__none__' } })
    expect(screen.getByText('Older Family')).toBeInTheDocument()
    expect(screen.queryByText('Ford Family')).not.toBeInTheDocument()
  })
})

describe('Family record — funding source and payment plan', () => {
  const open = (household) => render(
    <FamilyDetailModal household={household} orgId="org-1" members={[]}
      onClose={vi.fn()} onSaved={vi.fn()} />
  )

  it('shows the answer the family gave at registration beside the staff field', async () => {
    open(HOUSEHOLDS[0])
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByText(/answered at registration/i)).toBeInTheDocument()
    expect(screen.getByText('Utah Fits All')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Not set')).toBeInTheDocument()
  })

  it('sets the funding source from that answer in one click', async () => {
    open(HOUSEHOLDS[0])
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.click(await screen.findByRole('button', { name: /Set funding source to UFA/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/households/h1',
      expect.objectContaining({ funding_source: 'ufa' })))
  })

  it('does not offer the shortcut once the funding source already matches', async () => {
    open({ ...HOUSEHOLDS[0], funding_source: 'ufa' })
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    await screen.findByText(/answered at registration/i)
    expect(screen.queryByRole('button', { name: /Set funding source/ })).not.toBeInTheDocument()
  })

  it('records that a family is paying monthly', async () => {
    open(HOUSEHOLDS[0])
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    fireEvent.change(await screen.findByDisplayValue('Not recorded'),
      { target: { value: 'monthly' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/api/sis/households/h1',
      expect.objectContaining({ payment_plan_preference: 'monthly' })))
  })
})
