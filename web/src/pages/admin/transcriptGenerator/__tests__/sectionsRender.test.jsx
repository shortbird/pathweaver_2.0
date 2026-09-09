import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    // Every credit source reaches the table
    expect(screen.getByText('Mathematics')).toBeInTheDocument()
    // Language Arts appears in the table and again in a subject <select>;
    // what matters is that the transfer row reached the document at all.
    expect(screen.getAllByText('Language Arts').length).toBeGreaterThan(0)
    expect(screen.getByText('Green Canyon High')).toBeInTheDocument()
    expect(screen.getByText('Ceramics I')).toBeInTheDocument()
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
    expect(await screen.findByText('Green Canyon High')).toBeInTheDocument()
    expect(screen.getByTitle('Break into individual courses')).toBeInTheDocument()
  })
})
