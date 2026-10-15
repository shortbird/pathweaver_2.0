import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * QF-02 guard: the transcript page's five regions still render after the split.
 *
 * The printable region matters more than most: it is the document a registrar
 * receives, and it is assembled from props that the page derives (creditRows,
 * the override fields) rather than from anything the child fetches itself. A
 * prop dropped in the split would produce a transcript missing a column, which
 * nothing else in this suite would notice.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn(async () => true) }))

const DATA = {
  student: {
    first_name: 'Ada', last_name: 'Lovelace', date_of_birth: '2008-07-22',
    organization_name: 'Test Academy',
  },
  // Shapes matter here: earned_credits is keyed by subject, class_credits is a
  // list grouped by school_subject, and transfer_credits carries its own
  // subjects/course_names breakdown. buildCreditRows reads all three.
  earned_credits: { math: { display_name: 'Mathematics', credits: 1 } },
  class_credits: [
    { school_subject: 'science', display_name: 'Science', course_name: 'Biology', credits: 0.5 },
  ],
  transfer_credits: [{
    id: 'tc1', school_name: 'Green Canyon High',
    subjects: { language_arts: { display_name: 'Language Arts', credits: 2 } },
    course_names: {},
  }],
  planned_credits: [{
    id: 'pc1', display_name: 'Fine Arts', course_name: 'Ceramics I',
    credits: 0.5, status: 'in_progress',
  }, {
    id: 'pc2', display_name: 'Fine Arts', course_name: 'Pottery II',
    credits: 0.5, status: 'dropped',
  }, {
    id: 'pc3', display_name: 'Health', course_name: 'First Aid',
    credits: 0.5, status: 'completed',
  }],
  totals: { total_credits: 4 },
  accreditation: { source: 'optio' },
  overrides: {},
}

vi.mock('../../../../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(() => Promise.resolve({ data: { data: DATA } })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})

import TranscriptGeneratorPage from '../../TranscriptGeneratorPage'

// The row whose Subject cell is `subject` (the course cell may say it too).
const rowFor = (subject) => screen.getAllByTestId('transcript-row')
  .find(r => r.querySelector('td')?.textContent === subject)

const renderPage = () => render(
  <MemoryRouter initialEntries={['/admin/transcript/u1']}>
    <Routes>
      <Route path="/admin/transcript/:userId" element={<TranscriptGeneratorPage />} />
    </Routes>
  </MemoryRouter>,
)

describe('transcript generator sections render after the split', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the toolbar and the printable transcript together', async () => {
    renderPage()
    // Toolbar
    expect(await screen.findByText(/Download PDF/i)).toBeInTheDocument()
    // Printable document: the name comes through the EditableField component
    expect(screen.getByText('Lovelace, Ada')).toBeInTheDocument()
    expect(screen.getByText('Test Academy')).toBeInTheDocument()
    // Every credit source reaches the table. Unnamed Optio credit prints
    // under its subject's name, in both columns (ticket 9200a103, item 4).
    expect(rowFor('Mathematics')).toBeTruthy()
    // Language Arts appears in the table and again in a subject <select>;
    // what matters is that the transfer row reached the document at all.
    expect(screen.getAllByText('Language Arts').length).toBeGreaterThan(0)
    expect(screen.getByText('Green Canyon High')).toBeInTheDocument()
    expect(screen.getByText('Ceramics I')).toBeInTheDocument()
  })

  // Ticket 9200a103, item 1: Optio awards only an A, so a course goes on the
  // transcript only when it is finished. The old table printed Ceramics I with
  // "In Progress" in the Grade column. A planned credit is never finished
  // (Tanner, 2026-09-29), so no planned row prints -- not even one saved as
  // 'completed' before the form stopped offering it. The editor must still
  // list them (this is where planned credits are managed), but the rows must
  // not print: .no-print is what both the print stylesheet and the PDF
  // onclone strip.
  it('ticket 9200a103: keeps planned credits in the editor but off the printed transcript', async () => {
    renderPage()
    const rowOf = async (name) => (await screen.findByText(name)).closest('tr')

    const inProgress = await rowOf('Ceramics I')
    const dropped = await rowOf('Pottery II')
    const legacyCompleted = await rowOf('First Aid')
    // Still visible and editable in the admin editor.
    expect(inProgress).toBeInTheDocument()
    expect(dropped).toBeInTheDocument()
    expect(inProgress.querySelector('[title="Edit"]')).not.toBeNull()
    // ...but hidden from print and from the PDF, whatever the status.
    expect(inProgress).toHaveClass('no-print')
    expect(dropped).toHaveClass('no-print')
    expect(legacyCompleted).toHaveClass('no-print')
    expect(legacyCompleted.textContent).toContain('not printed')

    // Finished credit (quest, class, transfer) prints, with its grade.
    expect(await rowOf('Green Canyon High')).not.toHaveClass('no-print')
    for (const subject of ['Mathematics', 'Science']) {
      expect(rowFor(subject)).not.toHaveClass('no-print')
    }

    // Nothing printable is dropped or marked not printed. The one unfinished
    // status that prints is Optio credit part way through a numbered course
    // (Tanner, 2026-10-15): Science's 0.5 class credit is half of Science 1.
    const printable = screen.getAllByTestId('transcript-row').filter(r => !r.classList.contains('no-print'))
    printable.forEach(r => {
      expect(r.textContent).not.toMatch(/Dropped|not printed/)
    })
    expect(printable.filter(r => r.textContent.includes('In Progress')).map(r => r.textContent))
      .toEqual(['ScienceScience 1Optio0.50In Progress'])
  })

  it('the planned-credit form does not offer Completed (ticket 9200a103)', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('Add Planned Credit'))
    const options = screen.getAllByRole('option').map(o => o.getAttribute('value'))
    expect(options).toContain('in_progress')
    expect(options).toContain('dropped')
    expect(options).not.toContain('completed')
  })

  it('opens the planned-credit form from the toolbar', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('Add Planned Credit'))
    // The form's Subject select is what proves PlannedCreditForm mounted with
    // SUBJECT_OPTIONS -- the constant that moved to its own module in the split.
    expect(await screen.findByText('Add Planned Credit', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Financial Literacy' })).toBeInTheDocument()
  })

  it('offers the course breakdown editor on a transfer credit', async () => {
    renderPage()
    // The transfer row renders with the sending school, and the split control
    // that opens CourseBreakdownEditor sits on it.
    const transferRow = (await screen.findByText('Green Canyon High')).closest('tr')
    expect(within(transferRow).getByTitle('Break into individual courses')).toBeInTheDocument()
  })

  // Ticket 9200a103, item 4, then Tanner 2026-10-15: unnamed Optio credit
  // prints as numbered courses named for the subject. It no longer prints as
  // "Optio Competency-Based", and a class no longer prints its own title.
  it('ticket 9200a103: unnamed Optio and class credit print as numbered subject courses', async () => {
    renderPage()
    await screen.findByText('Lovelace, Ada')
    expect(screen.queryByText('Optio Competency-Based')).toBeNull()
    expect(screen.queryByText('Biology')).toBeNull()
    expect(within(rowFor('Science')).getByText('Science 1')).toBeInTheDocument()
    expect(within(rowFor('Mathematics')).getByText('Mathematics 1')).toBeInTheDocument()
  })

  it('ticket 9200a103: the office splits Optio credit into named courses; the rest is numbered', async () => {
    const api = (await import('../../../../services/api')).default
    renderPage()
    await screen.findByText('Lovelace, Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Break Mathematics into courses' }))

    // Optio awards only an A, so the Optio editor has no grade column.
    expect(screen.queryByRole('combobox', { name: 'Grade' })).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Course name (e.g. Woodworking)'), { target: { value: 'Algebra I' } })
    fireEvent.change(screen.getByPlaceholderText('Credits'), { target: { value: '0.75' } })
    fireEvent.click(screen.getByText('Save Breakdown'))

    const algebra = (await screen.findByText('Algebra I')).closest('tr')
    expect(algebra.textContent).toContain('0.75')
    const rest = screen.getAllByTestId('transcript-row')
      .find(r => r.textContent.startsWith('MathematicsMathematics 1'))
    expect(rest.textContent).toContain('0.25')
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/api/admin/transcript/u1/overrides',
      expect.objectContaining({ optio_courses_math: [{ name: 'Algebra I', credits: 0.75 }] }),
    ), { timeout: 2000 })
  })

  it('ticket 9200a103: refuses an Optio breakdown that claims more credit than was earned', async () => {
    const toast = (await import('react-hot-toast')).default
    renderPage()
    await screen.findByText('Lovelace, Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Break Mathematics into courses' }))
    fireEvent.change(screen.getByPlaceholderText('Course name (e.g. Woodworking)'), { target: { value: 'Algebra I' } })
    fireEvent.change(screen.getByPlaceholderText('Credits'), { target: { value: '1.5' } })
    fireEvent.click(screen.getByText('Save Breakdown'))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('cannot be more than 1'))
    expect(screen.queryByText('Algebra I', { selector: 'td, td *' })).toBeNull()
  })
})
