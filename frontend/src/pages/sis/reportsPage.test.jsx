import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
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
    if (url.includes('/reports/registration-questions')) {
      return { data: { questions: [
        { key: 'media_release', label: 'Photo & Media Release', type: 'select', per_student: false },
        { key: 'special_needs', label: 'Special needs', type: 'text', per_student: true },
      ] } }
    }
    if (url.includes('/reports/medications')) {
      return { data: { report: { rows: [{
        student: 'Kid Example', medications: 'Inhaler', notes: 'Medication schedule: mornings',
        parent: 'Pat Parent', parent_phone: '555-0100', emergency_contact: 'Gran (grandmother) 555-0101',
      }] } } }
    }
    if (url.includes('/reports/media-release')) {
      return { data: { report: {
        questions: [{ key: 'media_release', label: 'Photo & Media Release' }],
        rows: [{ student: 'Kid Example', family: 'Example Family', answers: { media_release: 'Not answered' }, parent: '' }],
      } } }
    }
    if (url.includes('/reports/registration-answers')) {
      return { data: { report: {
        question: { key: 'special_needs', label: 'Special needs', per_student: true },
        rows: [{ student: 'Kid Example', family: 'Example Family', parent: 'Pat Parent', parent_email: 'pat@example.com', answer: 'None', status: 'completed' }],
      } } }
    }
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

  it('renders the information reports section with canned cards and the question picker', async () => {
    render(<ReportsPage />)
    expect(await screen.findByText('Information reports')).toBeInTheDocument()
    expect(screen.getByText('Medications')).toBeInTheDocument()
    expect(screen.getByText('Media release')).toBeInTheDocument()
    expect(screen.getByText('Question report')).toBeInTheDocument()
    // Question picker is fed by /reports/registration-questions.
    expect(await screen.findByRole('option', { name: 'Photo & Media Release' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Special needs' })).toBeInTheDocument()
  })

  it('runs the medications report and shows an inline table with print and CSV actions', async () => {
    render(<ReportsPage />)
    await screen.findByText('Information reports')
    const [medicationsRun] = screen.getAllByRole('button', { name: 'View report' })
    fireEvent.click(medicationsRun)
    expect(await screen.findByText('Kid Example')).toBeInTheDocument()
    expect(screen.getByText('Inhaler')).toBeInTheDocument()
    expect(screen.getByText('Medication schedule: mornings')).toBeInTheDocument()
    expect(screen.getByText('Print')).toBeInTheDocument()
    expect(screen.getByText('Download CSV')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/reports/medications'))
  })

  it('runs a question report for the selected registration question', async () => {
    render(<ReportsPage />)
    await screen.findByRole('option', { name: 'Special needs' })
    fireEvent.change(screen.getByLabelText('Registration question'), { target: { value: 'special_needs' } })
    const runButtons = screen.getAllByRole('button', { name: 'View report' })
    fireEvent.click(runButtons[runButtons.length - 1])
    expect(await screen.findByText('None')).toBeInTheDocument()
    expect(screen.getByText('pat@example.com')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/sis/reports/registration-answers?question_key=special_needs'))
  })
})
