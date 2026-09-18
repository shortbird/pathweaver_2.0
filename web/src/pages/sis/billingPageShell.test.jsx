import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

import BillingPage from './BillingPage'

// The shell is under test: which tab opens, what the URL says, the badge.
// The bodies have their own suites (tuitionApprovalPage, billingPage).
vi.mock('./billingPage/InvoicePanel', () => ({ default: () => <div>INVOICE PANEL</div> }))
vi.mock('./billingPage/LedgerPanel', () => ({ default: ({ view, recurring }) => <div>LEDGER PANEL {view} ({(recurring || []).length})</div> }))

let recurring = []
vi.mock('./RecurringTuitionList', () => ({
  useRecurringTuition: () => ({ schedules: recurring, load: vi.fn() }),
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', activeOrg: { id: 'org-1' }, orgs: [], setOrgId: vi.fn(), isSuperadmin: false, loading: false }),
  withOrg: (p) => p,
}))

const Where = () => {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}{loc.search}</div>
}

const render = (entry = '/billing') => rtlRender(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/billing" element={<><BillingPage /><Where /></>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => { recurring = [] })

describe('BillingPage shell', () => {
  it('lands on Charges with five tabs in the order the money happens', () => {
    render()
    expect(screen.getByRole('heading', { name: 'Billing' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent))
      .toEqual(['To invoice', 'Charges', 'Outstanding', 'Monthly tuition', 'Charge detail'])
    expect(screen.getByText('LEDGER PANEL charges (0)')).toBeInTheDocument()
  })

  it('opens the tuition queue from ?tab=invoice, where the dashboard tile and /tuition point', () => {
    render('/billing?tab=invoice')
    expect(screen.getByText('INVOICE PANEL')).toBeInTheDocument()
    expect(screen.queryByText(/LEDGER PANEL/)).not.toBeInTheDocument()
  })

  it('writes the tab to the URL and drops it again for the default', () => {
    render()
    fireEvent.click(screen.getByRole('tab', { name: 'Outstanding' }))
    expect(screen.getByText('LEDGER PANEL outstanding (0)')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/billing?tab=outstanding')
    fireEvent.click(screen.getByRole('tab', { name: 'Charges' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/billing')
    expect(screen.getByTestId('where')).not.toHaveTextContent('?')
  })

  it('lands an unknown tab on Charges', () => {
    render('/billing?tab=payroll')
    expect(screen.getByText('LEDGER PANEL charges (0)')).toBeInTheDocument()
  })

  it('wears the monthly schedule count on its tab, fetched once for the page', () => {
    recurring = [{ id: 's1' }, { id: 's2' }]
    render('/billing?tab=monthly')
    const tab = screen.getByRole('tab', { name: /Monthly tuition/ })
    expect(within(tab).getByText('2')).toBeInTheDocument()
    expect(screen.getByText('LEDGER PANEL monthly (2)')).toBeInTheDocument()
  })
})

describe('the old Tuition path', () => {
  it('is a redirect to the invoice tab in SisRoutes', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const here = path.dirname(fileURLToPath(import.meta.url))
    const src = fs.readFileSync(path.join(here, '../../sis/SisRoutes.jsx'), 'utf8')
    expect(src).toMatch(/<Route path="tuition" element={<TuitionRedirect \/>} \/>/)
    expect(src).toMatch(/\/billing\?\$\{params\.toString\(\)\}/)
  })
})
