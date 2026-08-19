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
    if (url.includes('/reports/classes')) {
      return { data: { report: {
        fields: [
          { key: 'name', label: 'Class', hint: 'Class name', default: true },
          { key: 'teacher', label: 'Teacher', hint: 'Primary instructor', default: true },
          { key: 'description', label: 'Description', hint: 'Class description text', default: false },
        ],
        selected: ['name', 'teacher'],
        rows: [{ name: 'Pottery', teacher: 'Ruth Stewart', description: 'Hand building and the wheel' }],
      } } }
    }
    if (url.includes('/reports/rosters')) {
      return { data: { report: {
        fields: [
          { key: 'class_name', label: 'Class', hint: 'Which class this row is in', default: true },
          { key: 'status', label: 'Status', hint: 'Enrolled, or waiting/offered', default: true },
          { key: 'name', label: 'Student', hint: 'Full name', default: true },
          { key: 'date_of_birth', label: 'Birthdate', hint: 'YYYY-MM-DD', default: false },
        ],
        selected: ['class_name', 'status', 'name'],
        rows: [
          { class_name: 'Pottery', status: 'Enrolled', name: 'Nora Candland', date_of_birth: '2014-01-09' },
          { class_name: 'Guitar Jam', status: 'Waiting', name: 'Ryder Swenson', date_of_birth: '2017-03-02' },
        ],
      } } }
    }
    if (url.includes('/api/sis/classes')) {
      return { data: { classes: [
        { id: 'c1', name: 'Pottery' },
        { id: 'c2', name: 'Guitar Jam' },
      ] } }
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

  it('runs the class report and lets the office pick which columns to show', async () => {
    localStorage.removeItem('sis_class_report_cols')
    render(<ReportsPage />)
    await screen.findByText('Information reports')
    fireEvent.click(screen.getByRole('button', { name: 'View class report' }))

    expect(await screen.findByText('Pottery')).toBeInTheDocument()
    expect(screen.getByText('Ruth Stewart')).toBeInTheDocument()
    // Unselected column is offered in the picker but not in the table.
    expect(screen.queryByText('Hand building and the wheel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Description'))
    expect(await screen.findByText('Hand building and the wheel')).toBeInTheDocument()
    // Turning a column off can't empty the table.
    fireEvent.click(screen.getByLabelText('Class'))
    fireEvent.click(screen.getByLabelText('Teacher'))
    fireEvent.click(screen.getByLabelText('Description'))
    expect(screen.getByText('Hand building and the wheel')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('sis_class_report_cols'))).toEqual(['description'])
  })

  it('downloads the class report CSV with the columns currently on screen', async () => {
    localStorage.setItem('sis_class_report_cols', JSON.stringify(['name', 'teacher']))
    render(<ReportsPage />)
    await screen.findByText('Information reports')
    fireEvent.click(screen.getByRole('button', { name: 'View class report' }))
    await screen.findByText('Pottery')
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('fields=name,teacher'))

    fireEvent.click(screen.getByLabelText('Description'))
    fireEvent.click(screen.getByText('Download CSV'))
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('fields=name,teacher,description'), expect.objectContaining({ responseType: 'blob' }))
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

/**
 * iCreate asked for rosters-in-a-spreadsheet four separate times — the most
 * requested thing in their backlog. Exporting ONE class shipped on the Classes
 * page; this is the other half: several classes in one sheet, waitlisted
 * students included if you want them, and a column picker.
 */
describe('Class rosters report', () => {
  it('will not run until a class is picked', async () => {
    render(<ReportsPage />)
    expect(await screen.findByLabelText('Classes')).toBeInTheDocument()
    expect(screen.getByLabelText('View roster report')).toBeDisabled()
    expect(screen.getByText('Choose one or more classes.')).toBeInTheDocument()
  })

  it('runs across several classes at once and shows the rows', async () => {
    render(<ReportsPage />)
    const picker = await screen.findByLabelText('Classes')
    fireEvent.change(picker, { target: { value: 'c1' } })
    fireEvent.click(screen.getByLabelText('View roster report'))

    expect(await screen.findByText('Class rosters')).toBeInTheDocument()
    expect(screen.getByText('Nora Candland')).toBeInTheDocument()
    expect(screen.getByText('Ryder Swenson')).toBeInTheDocument()
    // Both classes are in ONE table — that is the whole ask. (The names also
    // appear in the picker above, hence scoping the check to table cells.)
    const cells = [...document.querySelectorAll('td')].map((td) => td.textContent)
    expect(cells).toContain('Pottery')
    expect(cells).toContain('Guitar Jam')
    expect(cells).toContain('Waiting')
  })

  it('asks the server for the waitlist when the box is ticked', async () => {
    render(<ReportsPage />)
    const picker = await screen.findByLabelText('Classes')
    fireEvent.change(picker, { target: { value: 'c1' } })
    fireEvent.click(screen.getByLabelText('Include waitlisted students'))
    fireEvent.click(screen.getByLabelText('View roster report'))

    await screen.findByText('Class rosters')
    expect(api.get.mock.calls.map(([u]) => u))
      .toContainEqual(expect.stringContaining('include_waitlist=true'))
  })

  it('Select all picks every class', async () => {
    render(<ReportsPage />)
    await screen.findByLabelText('Classes')
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByLabelText('View roster report')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('a column can be added after the report is on screen', async () => {
    render(<ReportsPage />)
    fireEvent.change(await screen.findByLabelText('Classes'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByLabelText('View roster report'))
    await screen.findByText('Class rosters')

    expect(screen.queryByText('2014-01-09')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Birthdate'))
    expect(screen.getByText('2014-01-09')).toBeInTheDocument()
  })
})
