import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui, { route = '/reports' } = {}) =>
  rtlRender(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)

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
    if (url.includes('/reports/revenue')) return { data: { report: { invoice_count: 2, billed_cents: 1245000, collected_cents: 1235000, outstanding_cents: 10000 } } }
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
    if (url.includes('/reports/emergency-contacts')) {
      return { data: { report: {
        max_guardians: 2, max_emergency: 2, incomplete: 1,
        rows: [
          { student: 'Adaline Bellon', age: 7, family: 'Bellon',
            guardians: [
              { name: 'Jane Bellon (Mother)', phone: '555-0100' },
              { name: 'Sam Bellon (Father)', phone: '555-0101' },
            ],
            emergency_contacts: [{ name: 'Ruth Vance (Grandmother)', phone: '555-0199' }],
            missing: '' },
          { student: 'Kai Ono', age: 9, family: 'Ono',
            guardians: [{ name: 'Mia Ono (Mother)', phone: '' }],
            emergency_contacts: [],
            missing: 'no guardian phone; no emergency contact' },
        ],
      } } }
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
        { id: 'c1', name: 'Pottery', min_age: 8, max_age: 12,
          primary_instructor: { name: 'Marika' },
          meetings: [{ day_of_week: 2, start_time: '09:00', end_time: '10:00' }] },
        { id: 'c2', name: 'Guitar Jam', min_age: 12, max_age: 18,
          primary_instructor: { name: 'Tyler' },
          meetings: [{ day_of_week: 4, start_time: '13:00', end_time: '14:00' }] },
      ] } }
    }
    if (url.includes('/reports/payments')) {
      return { data: { report: {
        rows: [
          { recorded_at: '2026-08-14', family: 'Candland', student: 'Nora Candland',
            invoice: 'INV-2', method: 'Check', amount: '$365.00', reference: '1042',
            note: '', recorded_by: 'Molly' },
          { recorded_at: '2026-08-12', family: 'Swenson', student: 'Ryder Swenson',
            invoice: 'INV-1', method: 'Scholarship', amount: '$730.00', reference: '',
            note: 'Board approved', recorded_by: 'Molly' },
        ],
        totals: [
          { method: 'Scholarship', count: 1, cents: 73000, amount: '$730.00' },
          { method: 'Check', count: 1, cents: 36500, amount: '$365.00' },
        ],
        total_cents: 109500,
      } } }
    }
    if (url.includes('/reports/student-schedule')) {
      return { data: { report: {
        days: [{ key: '2', label: 'Tue' }, { key: '4', label: 'Thu' }],
        has_unscheduled: true,
        rows: [
          { student: 'Nora Candland', age: '13', family: 'Candland', days: 'Tue Thu',
            by_day: { 2: 'Block 1: Pottery', 4: 'Block 2: Guitar Jam' }, unscheduled: '' },
          { student: 'Ryder Swenson', age: '', family: 'Swenson', days: '',
            by_day: { 2: '', 4: '' }, unscheduled: 'Chess Club' },
        ],
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

import ReportsPage, { BlockRosters, DayRosters, cellSortValue, compareCells } from './ReportsPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  vi.clearAllMocks()
})

// The reports are a list on the left (reportsPage/ReportNav); pick one by
// name. A report with nothing to choose runs as soon as it is picked.
const openReport = async (title) => {
  const nav = await screen.findByRole('navigation', { name: 'Reports' })
  fireEvent.click(within(nav).getByRole('button', { name: title }))
}

describe('ReportsPage', () => {
  it('opens on the overview: enrollment, revenue, and attendance summaries', async () => {
    render(<ReportsPage />)
    expect(await screen.findByText('Outstanding')).toBeInTheDocument()
    expect(screen.getByText('$12,450.00')).toBeInTheDocument()   // billed, with the comma
    expect(screen.getByText('$100.00')).toBeInTheDocument()      // outstanding
    expect(screen.getByText('75%')).toBeInTheDocument()       // attendance rate
    expect(screen.getByText('Active classes')).toBeInTheDocument()
  })

  /**
   * iCreate, 2026-08-21: "the revenue is listed on the reports. If campus
   * coordinators can see that page, then that should not be showing up."
   * The backend refuses them the route; this makes sure the page never asks.
   */
  it('shows a campus coordinator no revenue or payments, and does not even ask for it', async () => {
    authState = { user: { id: 'u2', role: 'org_managed', org_roles: ['campus_coordinator'], is_org_admin: true } }
    render(<ReportsPage />)
    expect(await screen.findByText('Attendance rate')).toBeInTheDocument()
    expect(screen.queryByText('Revenue (recorded)')).not.toBeInTheDocument()
    expect(screen.queryByText('Payments')).not.toBeInTheDocument()
    expect(screen.queryByText('Money')).not.toBeInTheDocument()
    expect(screen.queryByText('$12,450.00')).not.toBeInTheDocument()
    expect(api.get.mock.calls.map(([u]) => u))
      .not.toContainEqual(expect.stringContaining('/reports/revenue'))
    // The operational half of the page is still theirs.
    expect(screen.getByText('Students in classes')).toBeInTheDocument()
  })

  /**
   * iCreate, 2026-08-20: "Is there a way to do a report on method of payment?"
   * The method was on every payment row and read back nowhere, so answering it
   * meant opening invoices one at a time.
   */
  it('reports payments with the split by method', async () => {
    render(<ReportsPage />)
    await openReport('Payments')
    expect(await screen.findByText(/Scholarship: \$730\.00 \(1\)/)).toBeInTheDocument()
    const cells = [...document.querySelectorAll('td')].map((td) => td.textContent)
    expect(cells).toContain('Nora Candland')
    expect(cells).toContain('Check')
  })

  /**
   * iCreate (Molly), 2026-08-21: "I want to get a student report of a master
   * list of all students showing which days/class blocks they come."
   */
  it('runs the student schedule report with a column per school day', async () => {
    render(<ReportsPage />)
    await openReport('Student schedule')
    expect(await screen.findByText('Block 1: Pottery')).toBeInTheDocument()
    const headers = [...document.querySelectorAll('th')].map((th) => th.textContent)
    expect(headers.join(' ')).toMatch(/Tue/)
    expect(headers.join(' ')).toMatch(/Age/)
    expect(headers.join(' ')).toMatch(/Unscheduled classes/)
    const cells = [...document.querySelectorAll('td')].map((td) => td.textContent)
    expect(cells).toContain('Nora Candland')
    expect(cells).toContain('13')
    expect(cells).toContain('Block 2: Guitar Jam')
    // A class with no schedule shows as unscheduled rather than vanishing,
    // and a student with no scheduled days still gets a row.
    expect(cells).toContain('Chess Club')
    expect(cells).toContain('Ryder Swenson')
  })

  it('does not offer the payments report to a campus coordinator', async () => {
    authState = { user: { id: 'u2', role: 'org_managed', org_roles: ['campus_coordinator'] } }
    render(<ReportsPage />)
    const nav = await screen.findByRole('navigation', { name: 'Reports' })
    expect(within(nav).queryByRole('button', { name: 'Payments' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Medications' })).toBeInTheDocument()
  })

  it('remembers the picked report in the URL, and opens on it', async () => {
    render(<ReportsPage />, { route: '/reports?report=medications' })
    expect(await screen.findByText('Kid Example')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Medications' })).toBeInTheDocument()
  })

  it('offers the reports as a select on a small screen, in the same groups', async () => {
    render(<ReportsPage />)
    const select = await screen.findByLabelText('Report')
    expect(within(select).getByRole('option', { name: 'Class rosters' })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'allergies' } })
    expect(await screen.findByRole('heading', { level: 2, name: 'Allergies' })).toBeInTheDocument()
  })

  it('scrolls to the answer when a report is run', async () => {
    /**
     * The results table renders below eleven cards, so on a school-sized class
     * list the answer landed off screen and the button read as broken.
     */
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<ReportsPage />)
    await openReport('Payments')
    await screen.findByText(/Scholarship: \$730\.00 \(1\)/)
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('does not re-scroll when a column is ticked on a report already on screen', async () => {
    render(<ReportsPage />)
    await pickClass('Pottery')
    fireEvent.click(screen.getByLabelText('View roster report'))
    await screen.findByRole('heading', { level: 3, name: 'Class rosters' })

    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    fireEvent.click(screen.getByLabelText('Birthdate'))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('lists every report by group, and the question picker waits for a choice', async () => {
    render(<ReportsPage />)
    const nav = await screen.findByRole('navigation', { name: 'Reports' })
    expect(within(nav).getByText('Health & safety')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Medications' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Media release' })).toBeInTheDocument()
    await openReport('Registration answers')
    // Question picker is fed by /reports/registration-questions.
    expect(await screen.findByRole('option', { name: 'Photo & Media Release' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Special needs' })).toBeInTheDocument()
    expect(screen.getByText('Choose above, then run the report.')).toBeInTheDocument()
    expect(api.get.mock.calls.map(([u]) => u))
      .not.toContainEqual(expect.stringContaining('/reports/registration-answers'))
  })

  it('runs the medications report on pick and shows an inline table with print and CSV actions', async () => {
    render(<ReportsPage />)
    await openReport('Medications')
    expect(await screen.findByText('Kid Example')).toBeInTheDocument()
    expect(screen.getByText('Inhaler')).toBeInTheDocument()
    expect(screen.getByText('Medication schedule: mornings')).toBeInTheDocument()
    expect(screen.getByText('Print')).toBeInTheDocument()
    expect(screen.getByText('Download CSV')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/reports/medications'))
  })

  // iCreate, 2026-09-05 (41c838c5): "Could we get an emergency master list of
  // students with both parents/guardians listed along with contact info? ...
  // it would help us to see if we are missing any contact info still."
  it('runs the emergency contact sheet with both guardians on one row', async () => {
    render(<ReportsPage />)
    await openReport('Emergency contacts')
    expect(await screen.findByText('Adaline Bellon')).toBeInTheDocument()
    expect(screen.getByText('Jane Bellon (Mother)')).toBeInTheDocument()
    expect(screen.getByText('Sam Bellon (Father)')).toBeInTheDocument()
    expect(screen.getByText('Ruth Vance (Grandmother)')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/sis/reports/emergency-contacts'))
  })

  it('says on the sheet which families are still missing contact information', async () => {
    render(<ReportsPage />)
    await openReport('Emergency contacts')
    expect(await screen.findByText(/1 student still missing contact information/))
      .toBeInTheDocument()
    expect(screen.getByText('no guardian phone; no emergency contact')).toBeInTheDocument()
  })

  it('runs the class report and lets the office pick which columns to show', async () => {
    localStorage.removeItem('sis_class_report_cols')
    render(<ReportsPage />)
    await openReport('Class list')

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
    await openReport('Class list')
    await screen.findByText('Pottery')
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('fields=name,teacher'))

    fireEvent.click(screen.getByLabelText('Description'))
    fireEvent.click(screen.getByText('Download CSV'))
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('fields=name,teacher,description'), expect.objectContaining({ responseType: 'blob' }))
  })

  it('runs a question report for the selected registration question', async () => {
    render(<ReportsPage />)
    await openReport('Registration answers')
    await screen.findByRole('option', { name: 'Special needs' })
    fireEvent.change(screen.getByLabelText('Registration question'), { target: { value: 'special_needs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }))
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
// Ticking a class by the name the office reads, rather than by option value:
// the picker is a list of checkboxes now, because picking eight classes out of
// 152 by ctrl-click is a trap (iCreate, 2026-08-19).
const pickClass = async (name) => {
  await openReport('Class rosters')
  await screen.findByRole('group', { name: 'Classes' })
  fireEvent.click(screen.getByRole('checkbox', { name }))
}

describe('Class rosters report', () => {
  it('will not run until a class is picked', async () => {
    render(<ReportsPage />)
    await openReport('Class rosters')
    expect(await screen.findByRole('group', { name: 'Classes' })).toBeInTheDocument()
    expect(screen.getByLabelText('View roster report')).toBeDisabled()
    expect(screen.getByText('Choose one or more classes.')).toBeInTheDocument()
  })

  it('runs across several classes at once and shows the rows', async () => {
    render(<ReportsPage />)
    await pickClass('Pottery')
    fireEvent.click(screen.getByLabelText('View roster report'))

    expect(await screen.findByRole('heading', { level: 3, name: 'Class rosters' })).toBeInTheDocument()
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
    await pickClass('Pottery')
    fireEvent.click(screen.getByLabelText('Include waitlisted students'))
    fireEvent.click(screen.getByLabelText('View roster report'))

    await screen.findByRole('heading', { level: 3, name: 'Class rosters' })
    expect(api.get.mock.calls.map(([u]) => u))
      .toContainEqual(expect.stringContaining('include_waitlist=true'))
  })

  it('Select all picks every class', async () => {
    render(<ReportsPage />)
    await openReport('Class rosters')
    await screen.findByRole('group', { name: 'Classes' })
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByLabelText('View roster report')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('Clear is there as soon as anything is ticked', async () => {
    // It used to appear only once EVERY class was ticked (iCreate, c8affdb2).
    render(<ReportsPage />)
    await pickClass('Pottery')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByLabelText('View roster report')).toBeDisabled()
  })

  it('narrows the picker by name, day, start time and age, and ticks what is shown', async () => {
    // "filter by day & time & age too, so I don't have to manually look at
    // all classes, write them down, then go through the long list" (73963487).
    render(<ReportsPage />)
    await openReport('Class rosters')
    await screen.findByRole('group', { name: 'Classes' })

    fireEvent.change(screen.getByLabelText('Search classes'), { target: { value: 'tyler' } })
    expect(screen.queryByRole('checkbox', { name: 'Pottery' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Guitar Jam' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search classes'), { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: 'Tuesday' }))
    expect(screen.getByRole('checkbox', { name: 'Pottery' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Guitar Jam' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tuesday' }))

    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } })
    expect(screen.queryByRole('checkbox', { name: 'Pottery' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '' } })

    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '9' } })
    expect(screen.getByRole('checkbox', { name: 'Pottery' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Guitar Jam' })).not.toBeInTheDocument()

    // Select all ticks only what the filters left on screen.
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown (1)' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('checkbox', { name: 'Pottery' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Guitar Jam' })).not.toBeChecked()
  })

  it('keeps a ticked class in the selection when a filter hides it, and says so', async () => {
    render(<ReportsPage />)
    await pickClass('Pottery')
    fireEvent.click(screen.getByRole('button', { name: 'Thursday' }))
    expect(screen.queryByRole('checkbox', { name: 'Pottery' })).not.toBeInTheDocument()
    expect(screen.getByText('1 selected · 1 not shown by the filters')).toBeInTheDocument()
    expect(screen.getByLabelText('View roster report')).not.toBeDisabled()
  })

  it('a column can be added after the report is on screen', async () => {
    render(<ReportsPage />)
    await pickClass('Pottery')
    fireEvent.click(screen.getByLabelText('View roster report'))
    await screen.findByRole('heading', { level: 3, name: 'Class rosters' })

    expect(screen.queryByText('2014-01-09')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Birthdate'))
    expect(screen.getByText('2014-01-09')).toBeInTheDocument()
  })

  it('will not let Status be unticked while the waitlist is included', async () => {
    render(<ReportsPage />)
    await pickClass('Pottery')
    fireEvent.click(screen.getByLabelText('Include waitlisted students'))
    fireEvent.click(screen.getByLabelText('View roster report'))
    await screen.findByRole('heading', { level: 3, name: 'Class rosters' })

    // Without Status the sheet cannot say who is waiting and who is enrolled.
    const status = screen.getByLabelText('Status')
    expect(status).toBeDisabled()
    fireEvent.click(status)
    const cells = [...document.querySelectorAll('td')].map((td) => td.textContent)
    expect(cells).toContain('Waiting')
  })

  it('says the report is stale when the settings change under it', async () => {
    render(<ReportsPage />)
    await pickClass('Pottery')
    fireEvent.click(screen.getByLabelText('View roster report'))
    await screen.findByRole('heading', { level: 3, name: 'Class rosters' })
    expect(screen.queryByText(/run the report again/i)).not.toBeInTheDocument()

    // Ticking the waitlist after running used to change nothing on screen,
    // which is how "include waitlist" looked like it had done nothing.
    fireEvent.click(screen.getByLabelText('Include waitlisted students'))
    expect(screen.getByText(/run the report again/i)).toBeInTheDocument()
  })

  it('asks for archived classes only when the box is ticked', async () => {
    render(<ReportsPage />)
    await openReport('Class rosters')
    await screen.findByRole('group', { name: 'Classes' })
    expect(api.get.mock.calls.map(([u]) => u))
      .toContainEqual(expect.stringContaining('include_archived=false'))

    fireEvent.click(screen.getByLabelText('Include archived classes in the list'))
    await screen.findByRole('group', { name: 'Classes' })
    expect(api.get.mock.calls.map(([u]) => u))
      .toContainEqual(expect.stringContaining('/api/sis/classes?include_archived=true'))
  })
})

describe('Day rosters', () => {
  const DAYS = [{
    key: '2', label: 'Tuesday', student_count: 2,
    slots: [{
      slot: 'Block 1',
      classes: [{
        class_id: 'c1', name: 'Pottery', room: 'Kiln shed', teacher: 'Ana Rogers',
        time: '9:30am-10:25am', student_count: 2,
        students: [{ name: 'Ada Lovelace', family: 'Lovelace' },
                   { name: 'Bo Diddley', family: 'Diddley' }],
      }],
    }],
  }]

  it('lists the class, its room and everyone in it under the block', () => {
    render(<DayRosters days={DAYS} />)
    expect(screen.getByText('Block 1')).toBeInTheDocument()
    expect(screen.getByText('Pottery')).toBeInTheDocument()
    expect(screen.getByText(/Kiln shed/)).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Bo Diddley')).toBeInTheDocument()
  })

  it('prints one day on its own', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<DayRosters days={DAYS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print Tuesday' }))
    // The body class is what the print stylesheet keys off to hide the rest.
    expect(document.body.classList.contains('printing-one-day')).toBe(true)
    expect(print).toHaveBeenCalled()
    window.dispatchEvent(new Event('afterprint'))
    expect(document.body.classList.contains('printing-one-day')).toBe(false)
    print.mockRestore()
  })

  it('says so when nothing is scheduled', () => {
    render(<DayRosters days={[]} />)
    expect(screen.getByText('No classes are scheduled yet.')).toBeInTheDocument()
  })
})

describe('Block rosters', () => {
  const cls = (id, name, room, students) => ({
    class_id: id, name, room, teacher: 'Ana Rogers', time: '9:30am-10:30am',
    student_count: students.length, students,
  })
  const DAYS = [
    {
      key: '2',
      label: 'Tuesday',
      blocks: [
        { key: 'block-1', label: 'Block 1', time: '9:30am-10:30am', student_count: 2,
          classes: [cls('c1', 'Pottery', 'Kiln shed',
            [{ name: 'Ada Lovelace', age: '13' }, { name: 'Bo Diddley', age: '6' }])] },
        { key: 'block-2', label: 'Block 2', time: '10:30am-11:30am', student_count: 0,
          classes: [cls('c2', 'Choir', '', [])] },
      ],
    },
    { key: '4', label: 'Thursday', blocks: [
      { key: 'block-1', label: 'Block 1', time: '9:30am-10:30am', student_count: 1,
        classes: [cls('c3', 'Lego Lab', 'Jr Makerspace', [{ name: 'Cy Twombly', age: '9' }])] },
    ] },
  ]

  it('lists each class in the block with its room and every age', () => {
    render(<BlockRosters days={DAYS} day="2" onDayChange={() => {}} />)
    expect(screen.getByText('Pottery')).toBeInTheDocument()
    expect(screen.getByText(/Kiln shed/)).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    // The age beside the name is the whole reason she was doing this by hand.
    expect(screen.getByText('13')).toBeInTheDocument()
  })

  it('shows one day at a time', () => {
    render(<BlockRosters days={DAYS} day="2" onDayChange={() => {}} />)
    expect(screen.queryByText('Lego Lab')).not.toBeInTheDocument()
  })

  it('switches day when a day tab is picked', () => {
    const onDayChange = vi.fn()
    render(<BlockRosters days={DAYS} day="2" onDayChange={onDayChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Thursday' }))
    expect(onDayChange).toHaveBeenCalledWith('4')
  })

  it('falls back to the first day when the chosen one is not there', () => {
    render(<BlockRosters days={DAYS} day="9" onDayChange={() => {}} />)
    expect(screen.getByText('Pottery')).toBeInTheDocument()
  })

  it('prints one block on its own', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<BlockRosters days={DAYS} day="2" onDayChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print Block 1' }))
    expect(document.body.classList.contains('printing-one-day')).toBe(true)
    expect(print).toHaveBeenCalled()
    window.dispatchEvent(new Event('afterprint'))
    expect(document.body.classList.contains('printing-one-day')).toBe(false)
    print.mockRestore()
  })

  it('says so when a class has nobody in it', () => {
    render(<BlockRosters days={DAYS} day="2" onDayChange={() => {}} />)
    expect(screen.getByText('Nobody enrolled.')).toBeInTheDocument()
    expect(screen.getByText(/No room set/)).toBeInTheDocument()
  })

  it('says so when nothing is scheduled', () => {
    render(<BlockRosters days={[]} day="" onDayChange={() => {}} />)
    expect(screen.getByText('No classes are scheduled yet.')).toBeInTheDocument()
  })
})

describe('Tiered report sort helper functions', () => {
  it('parses day strings into comparable values', () => {
    expect(cellSortValue('days', 'Mon Wed')).toBe(1)
    expect(cellSortValue('days', 'Tue Thu')).toBe(2)
    expect(cellSortValue('days', 'Fri')).toBe(5)
    expect(cellSortValue('days', '')).toBeNull()
  })

  it('parses time strings into minute offsets', () => {
    expect(cellSortValue('time', '9:00am')).toBe(540)
    expect(cellSortValue('time', '11:30am')).toBe(690)
    expect(cellSortValue('time', '1:00pm')).toBe(780)
    expect(cellSortValue('time', '12:00pm')).toBe(720)
    expect(cellSortValue('time', '')).toBeNull()
  })

  it('parses amounts and age values', () => {
    expect(cellSortValue('tuition', '$365.00')).toBe(365)
    expect(cellSortValue('Amount', '$1,200.00')).toBe(1200)
    expect(cellSortValue('age', '13 years')).toBe(13)
    expect(cellSortValue('ages', '8–12')).toBe(8)
  })

  it('compares cells with proper type awareness', () => {
    expect(compareCells('days', 'Mon', 'Wed')).toBeLessThan(0)
    expect(compareCells('time', '9:00am', '1:00pm')).toBeLessThan(0)
    expect(compareCells('age', '13', '6')).toBeGreaterThan(0)
    expect(compareCells('tuition', '$365.00', '$1,200.00')).toBeLessThan(0)
  })
})

/**
 * iCreate, 2026-08-26 (1fc5012b): "Can we get a way to know who is leaving
 * halfdays, etc." — and 2026-09-01 (48da8820): "Can we have an option to print
 * an entire day instead of just a block?"
 */
describe('a day, read the way the office reads it', () => {
  const DAY = {
    key: '2', label: 'Tuesday', student_count: 2,
    slots: [{ slot: 'Block 1', classes: [] }],
    departures: [
      { name: 'Ada Lovelace', family: 'Lovelace', leaves_at: '12:30pm', early: true },
      { name: 'Bo Diddley', family: 'Diddley', leaves_at: '3:00pm', early: false },
    ],
  }

  it('names who goes home before the end of the day', () => {
    render(<DayRosters days={[DAY]} />)
    fireEvent.click(screen.getByText(/Going home/))
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('12:30pm')).toBeInTheDocument()
  })

  it('counts only the early leavers, not everyone with an end time', () => {
    render(<DayRosters days={[DAY]} />)
    expect(screen.getByText(/1 before the end of the day/)).toBeInTheDocument()
  })

  it('says nothing at all on a day nobody is enrolled for', () => {
    render(<DayRosters days={[{ ...DAY, departures: [] }]} />)
    expect(screen.queryByText(/Going home/)).not.toBeInTheDocument()
  })

  it('prints a whole day of blocks, not one block at a time', () => {
    const printed = []
    const original = document.getElementById.bind(document)
    vi.spyOn(document, 'getElementById').mockImplementation((id) => {
      printed.push(id)
      return original(id)
    })
    render(<BlockRosters days={[{ key: '2', label: 'Tuesday', blocks: [] }]}
      day="2" onDayChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print all of Tuesday' }))
    expect(printed).toContain('sis-blocks-2')
    document.getElementById.mockRestore()
  })
})
