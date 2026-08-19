import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ClassRosterExportModal from './ClassRosterExportModal'

/**
 * Printing a class roster and downloading it as a CSV.
 *
 * iCreate, 2026-08-18: "a way to print class rosters and download user
 * information as CSV files."
 *
 * A printed roster is a sign-in sheet, a field-trip contact list, or an allergy
 * list for the kitchen — the same roster with different columns, which is why
 * the columns are a picker. What is worth testing is that the picker actually
 * decides the file, that the paper-only columns come out empty rather than
 * missing, and that this reads the roster endpoint that carries guardians and
 * health data (and therefore writes the access log) rather than a quieter one
 * that would leave the same view unaudited.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../pages/sis/useSisOrg', () => ({
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const STUDENTS = [
  {
    student_id: 's1', name: 'Ryder Swenson', preferred_name: 'Ry', last_name: 'Swenson',
    age: 9, household_name: 'Swenson', household_phone: '435-555-0100',
    guardians: [{ name: 'Erin Swenson', email: 'erin@example.com', is_primary: true }],
    allergies: 'Peanuts', medications: null,
    attendance: { present: 10, absent: 2, late: 0, excused: 1 },
    enrolled_at: '2026-01-15T00:00:00Z',
  },
  {
    student_id: 's2', name: 'Nora Candland', preferred_name: null, last_name: 'Candland',
    age: 12, household_name: 'Candland', household_phone: null,
    guardians: [], allergies: null, medications: null, attendance: null,
    enrolled_at: '2026-01-16T00:00:00Z',
  },
]

let downloaded = ''
let originalCreate

beforeEach(() => {
  vi.clearAllMocks()
  downloaded = ''
  localStorage.clear()
  api.get.mockResolvedValue({ data: { students: STUDENTS } })
  originalCreate = URL.createObjectURL
  URL.createObjectURL = vi.fn((blob) => { downloaded = blob._text || ''; return 'blob:mock' })
  URL.revokeObjectURL = vi.fn()
  const OriginalBlob = global.Blob
  global.Blob = class extends OriginalBlob {
    constructor(parts, opts) { super(parts, opts); this._text = (parts || []).join('') }
  }
})

afterEach(() => { URL.createObjectURL = originalCreate })

const open = async () => {
  render(<ClassRosterExportModal classId="c1" className="Art Studio" orgId="org-1"
    onClose={vi.fn()} />)
  await screen.findByText('Ryder Swenson')
}

describe('Class roster print / export', () => {
  it('reads the access-logged roster endpoint', async () => {
    await open()
    // The teacher roster route is the one that carries guardians and health
    // data, and the one that writes student_access_logs. An admin printing this
    // must be audited exactly like a teacher opening it.
    expect(api.get).toHaveBeenCalledWith(
      '/api/sis/teacher/classes/c1/roster?organization_id=org-1')
  })

  it('shows the roster on screen ready to print', async () => {
    await open()
    expect(screen.getByText('Nora Candland')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).not.toBeDisabled()
  })

  it('exports the default columns', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    const [header, ...rows] = downloaded.trim().split('\r\n')
    expect(header).toBe('Student,Age,Guardians,Phone,Allergies')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toBe('Ryder Swenson,9,Erin Swenson,435-555-0100,Peanuts')
  })

  it('adds a column when you tick it', async () => {
    await open()
    fireEvent.click(screen.getByLabelText('Guardian emails'))
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(downloaded.split('\r\n')[0]).toContain('Guardian emails')
    expect(downloaded).toContain('erin@example.com')
  })

  it('drops a column when you untick it', async () => {
    await open()
    fireEvent.click(screen.getByLabelText('Allergies'))
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(downloaded.split('\r\n')[0]).not.toContain('Allergies')
  })

  it('keeps the student name whatever you untick', async () => {
    // A roster of ages with nobody's name on it is not a roster.
    await open()
    expect(screen.getByLabelText('Student')).toBeDisabled()
  })

  it('writes blank columns for a paper sign-in sheet', async () => {
    await open()
    fireEvent.click(screen.getByLabelText('Signature'))
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    const [header, first] = downloaded.trim().split('\r\n')
    expect(header.endsWith('Signature')).toBe(true)
    expect(first.endsWith(',')).toBe(true)   // room to sign, not a missing column
  })

  it('quotes a value containing a comma', async () => {
    api.get.mockResolvedValue({ data: { students: [{
      ...STUDENTS[0], allergies: 'Peanuts, shellfish',
    }] } })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(downloaded).toContain('"Peanuts, shellfish"')
  })

  it('summarises attendance rather than dumping the counts', async () => {
    await open()
    fireEvent.click(screen.getByLabelText('Attendance'))
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    // Excused absences count as absent on a paper roster.
    expect(downloaded).toContain('10 present / 3 absent')
  })

  it('remembers the column choice for next time', async () => {
    await open()
    fireEvent.click(screen.getByLabelText('Goes by'))
    expect(JSON.parse(localStorage.getItem('sis_roster_export'))).toContain('preferred_name')
  })

  it('says so when the class is empty instead of offering an empty file', async () => {
    api.get.mockResolvedValue({ data: { students: [] } })
    render(<ClassRosterExportModal classId="c1" className="Art Studio" orgId="org-1"
      onClose={vi.fn()} />)
    expect(await screen.findByText('No students enrolled yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled()
  })
})
