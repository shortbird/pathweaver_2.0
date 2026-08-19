import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * Health alerts on a teacher's class roster.
 *
 * iCreate, 2026-07-30: "On the alert that you have on students on the class
 * rosters, some of those have an alert but they have no allergies! Also I wonder
 * if you can make those clickable? Hovering doesn't always seem to work."
 *
 * The false positives are fixed server-side (utils/blank_values — "None" typed
 * into the allergies box is not an allergy). Here: the badge is a button that
 * opens the detail, because a `title` tooltip never appears on the tablet
 * teachers actually take attendance on.
 */

const render = (ui) => rtlRender(
  <MemoryRouter initialEntries={['/my-classes/c1']}>
    <Routes><Route path="/my-classes/:classId" element={ui} /></Routes>
  </MemoryRouter>,
)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1' }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/sis/StudentProgressTab', () => ({ default: () => <div /> }))
vi.mock('../../components/discussion/ClassDiscussion', () => ({ default: () => <div /> }))
vi.mock('../../components/discussion/ClassCurriculum', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassCurriculumLibrary', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassQuestsManager', () => ({ default: () => <div /> }))

const STUDENTS = [
  // The backend already stripped "None"/"N/A" answers, so this student carries
  // no alert at all — the row that used to show a red badge for nothing.
  { student_id: 's1', name: 'Nora Candland', age: 8, allergies: null, medications: null,
    has_alert: false, guardians: [] },
  { student_id: 's2', name: 'Van Stanfill', age: 9, allergies: 'Peanuts',
    medications: 'EpiPen', has_alert: true, guardians: [] },
]

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(() => Promise.resolve({ data: {} })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

import TeacherClassPage from './TeacherClassPage'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => {
    if (url.includes('/roster')) {
      return Promise.resolve({ data: { class: { id: 'c1', name: 'Lego Robotics' }, students: STUDENTS } })
    }
    return Promise.resolve({ data: { roster: [] } })
  })
})

describe('class roster health alerts', () => {
  it('flags only students who actually have something on file', async () => {
    render(<TeacherClassPage />)
    await screen.findAllByText('Van Stanfill')
    expect(screen.getAllByRole('button', { name: /Alert/ })).toHaveLength(1)
  })

  it('opens the detail on click rather than hiding it in a tooltip', async () => {
    render(<TeacherClassPage />)
    await screen.findAllByText('Van Stanfill')
    // Nothing is shown until the badge is opened. (There used to be a second,
    // print-only copy of the roster on this page; printing now goes through
    // ClassRosterExportModal, so the page carries one copy of anything.)
    expect(screen.queryAllByText(/Peanuts/)).toHaveLength(0)
    const badge = screen.getByRole('button', { name: /Alert/ })
    expect(badge).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(badge)
    expect(screen.getAllByText(/Peanuts/)).toHaveLength(1)
    expect(screen.getAllByText(/EpiPen/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Alert/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes again on a second click', async () => {
    render(<TeacherClassPage />)
    await screen.findAllByText('Van Stanfill')
    fireEvent.click(screen.getByRole('button', { name: /Alert/ }))
    fireEvent.click(screen.getByRole('button', { name: /Alert/ }))
    expect(screen.queryAllByText(/Peanuts/)).toHaveLength(0)
  })
})

/**
 * iCreate, 2026-08-19: "Print Roster button on this page prints the page, not
 * the actual roster. It should be a CSV file to download/print."
 *
 * The page printed itself behind a SUBTRACTIVE stylesheet — hide the sidebar,
 * hide the controls, hope nothing else showed — so what came out depended on
 * which tab happened to be open, and on any chrome that wasn't an <aside> or a
 * <nav>. It now opens the same modal the admin Classes page uses: one table,
 * everything else hidden, and a CSV download.
 */
describe('printing the roster', () => {
  it('opens the roster export instead of printing whatever is on screen', async () => {
    const printSpy = vi.fn()
    vi.stubGlobal('print', printSpy)
    render(<TeacherClassPage />)
    await screen.findAllByText('Van Stanfill')

    fireEvent.click(screen.getByRole('button', { name: /Print \/ export roster/ }))

    expect(await screen.findByRole('dialog', { name: /Print or export the class roster/ }))
      .toBeInTheDocument()
    // The button no longer prints the page directly — that was the bug.
    expect(printSpy).not.toHaveBeenCalled()
  })

  it('offers a CSV download, which is what they asked for', async () => {
    render(<TeacherClassPage />)
    await screen.findAllByText('Van Stanfill')
    fireEvent.click(screen.getByRole('button', { name: /Print \/ export roster/ }))
    expect(await screen.findByRole('button', { name: 'Download CSV' })).toBeInTheDocument()
  })
})
