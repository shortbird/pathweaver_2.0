import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
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
    if (url.includes('/reports/enrollment')) return { data: { report: { total: 5, by_status: { enrolled: 4, applicant: 1 }, active_classes: 3 } } }
    if (url.includes('/reports/revenue')) return { data: { report: { invoice_count: 2, billed_cents: 23000, collected_cents: 13000, outstanding_cents: 10000 } } }
    if (url.includes('/reports/attendance')) return { data: { report: { overall: { attendance_rate: 0.75, counts: { present: 2, absent: 1 }, total: 4 } } } }
    return { data: {} }
  }
  return { api: { get: vi.fn((url) => Promise.resolve(apiData(url))) } }
})
vi.mock('../../services/api', () => ({ default: api }))

import ReportsPage from './ReportsPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

describe('ReportsPage', () => {
  it('renders enrollment, revenue, and attendance summaries', async () => {
    render(<ReportsPage />)
    expect(await screen.findByText('Outstanding')).toBeInTheDocument()
    expect(screen.getByText('$230.00')).toBeInTheDocument()   // billed
    expect(screen.getByText('$100.00')).toBeInTheDocument()   // outstanding
    expect(screen.getByText('75%')).toBeInTheDocument()       // attendance rate
    expect(screen.getByText('Active classes')).toBeInTheDocument()
  })
})
