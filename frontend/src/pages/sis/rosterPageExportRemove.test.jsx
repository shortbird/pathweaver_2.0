import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * People › Everyone — CSV export and removing a person.
 *
 * iCreate, 2026-07-30: "When exporting a CSV file from the People page, it
 * doesn't include grade level, just the column for it. I had it filtered for
 * students only and by what age, but it included parents and didn't show age on
 * the CSV." The export hit a server endpoint that dumped the whole org and had
 * no Age column at all — and iCreate records ages, not grade levels.
 *
 * iCreate, 2026-07-29: "I deleted the duplicate swenson family, but three
 * members of that family are still showing and Idk how to remove them."
 */

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))
vi.mock('./StudentDetailModal', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/SisNewUserModal', () => ({ default: () => <div /> }))
vi.mock('../../services/masqueradeService', () => ({ startMasquerade: vi.fn() }))

const ROSTER = [
  { student_id: 's1', name: 'Ryder Swenson', first_name: 'Ryder', last_name: 'Swenson',
    is_student: true, role: 'student', roles: ['student'], age: 9, date_of_birth: '2017-03-02',
    enrollment_status: 'enrolled', grade_level: null, household_name: null, total_xp: 40 },
  { student_id: 's2', name: 'Nora Candland', first_name: 'Nora', last_name: 'Candland',
    is_student: true, role: 'student', roles: ['student'], age: 12, date_of_birth: '2014-01-09',
    enrollment_status: 'enrolled', grade_level: null, household_name: 'Candland', total_xp: 0 },
  { student_id: 'p1', name: 'Erin Swenson', first_name: 'Erin', last_name: 'Swenson',
    is_student: false, role: 'parent', roles: ['parent'], age: null, date_of_birth: null,
    enrollment_status: null, household_name: null, total_xp: 0,
    // The only one who joined this week.
    joined_at: new Date(Date.now() - 2 * 86400000).toISOString() },
]

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true, deleted: true } })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import RosterPage from './RosterPage'

let downloaded = ''
let originalCreate

beforeEach(() => {
  vi.clearAllMocks()
  downloaded = ''
  api.get.mockImplementation((url) => {
    if (url.includes('/removal-preview')) {
      return Promise.resolve({ data: {
        kind: 'student', name: 'Ryder Swenson', can_delete: true,
        history: { class_enrollments: 0, attendance: 0, completed_work: 0 }, blocking: {},
      } })
    }
    return Promise.resolve({ data: { roster: ROSTER } })
  })
  originalCreate = URL.createObjectURL
  // jsdom has no Blob.text() in the click path — read the CSV out of the Blob.
  URL.createObjectURL = vi.fn((blob) => { downloaded = blob._text || ''; return 'blob:mock' })
  URL.revokeObjectURL = vi.fn()
  const OriginalBlob = global.Blob
  global.Blob = class extends OriginalBlob {
    constructor(parts, opts) { super(parts, opts); this._text = (parts || []).join('') }
  }
})

afterEach(() => { URL.createObjectURL = originalCreate })

describe('People export', () => {
  // Export CSV opens the column picker; Download CSV writes the file. The
  // picker's own fetch is stubbed by the default api.get mock, so nothing
  // waits on it here.
  const exportCsv = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download CSV' }))
  }

  it('exports the rows on screen, with an Age column', async () => {
    render(<RosterPage />)
    await screen.findByText('Ryder Swenson')
    await exportCsv()
    const [header, ...rows] = downloaded.trim().split('\r\n')
    expect(header.split(',')).toContain('Age')
    expect(rows).toHaveLength(3)
    expect(downloaded).toContain('Ryder Swenson,Ryder,Swenson,9,2017-03-02')
  })

  it('respects the "Students only" filter instead of dumping the whole org', async () => {
    render(<RosterPage />)
    await screen.findByText('Ryder Swenson')
    fireEvent.click(screen.getByLabelText('Students only'))
    await exportCsv()
    expect(downloaded).toContain('Ryder Swenson')
    expect(downloaded).not.toContain('Erin Swenson')   // the parent is filtered out
  })

  it('respects the search box', async () => {
    render(<RosterPage />)
    await screen.findByText('Ryder Swenson')
    fireEvent.change(screen.getByPlaceholderText(/Search by name/), { target: { value: 'candland' } })
    await exportCsv()
    expect(downloaded).toContain('Nora Candland')
    expect(downloaded).not.toContain('Ryder Swenson')
  })

  it('never hits the whole-org export endpoint', async () => {
    render(<RosterPage />)
    await screen.findByText('Ryder Swenson')
    await exportCsv()
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('roster.csv'), expect.anything())
  })

  it('can add guardian and emergency-contact columns', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/roster/export-details')) {
        return Promise.resolve({ data: { details: {
          s1: {
            household_phone: '435-555-0100',
            guardians: [{ name: 'Erin Swenson', email: 'erin@example.com' }],
            emergency_contacts: [
              { name: 'Sam Reed', relationship: 'Aunt', phone: '435-555-0111', can_pickup: true },
            ],
          },
        } } })
      }
      return Promise.resolve({ data: { roster: ROSTER } })
    })
    render(<RosterPage />)
    await screen.findByText('Ryder Swenson')
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    fireEvent.click(await screen.findByLabelText('Emergency Contacts'))
    fireEvent.click(screen.getByLabelText('Guardians'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Download CSV' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(downloaded).toContain('Emergency Contacts')
    expect(downloaded).toContain('Sam Reed — Aunt — 435-555-0111')
    expect(downloaded).toContain('Erin Swenson')
  })
})

describe('Removing a person', () => {
  const openRemoveDialog = async (rowName) => {
    render(<RosterPage />)
    await screen.findByText(rowName)
    const row = screen.getByText(rowName).closest('tr')
    fireEvent.click(row.querySelector('button[aria-label="Actions"]'))
    fireEvent.click(screen.getByText('Remove from school…'))
    return screen.findByText(`Remove ${rowName}?`)
  }

  it('offers archive and delete once it knows what the account is attached to', async () => {
    await openRemoveDialog('Ryder Swenson')
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/people/s1/removal-preview')),
    )
    expect(await screen.findByText(/no school records/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled()
  })

  it('deletes the orphaned account', async () => {
    await openRemoveDialog('Ryder Swenson')
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/people/s1?organization_id=org-1&mode=delete'),
    )
  })

  it('archives instead when the person carries records', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/removal-preview')) {
        return Promise.resolve({ data: {
          kind: 'student', name: 'Nora Candland', can_delete: false,
          history: { attendance: 12 }, blocking: { attendance: 12 },
        } })
      }
      return Promise.resolve({ data: { roster: ROSTER } })
    })
    await openRemoveDialog('Nora Candland')
    expect(await screen.findByText(/12 attendance records/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/api/sis/people/s2?organization_id=org-1&mode=archive'),
    )
  })
})

/**
 * iCreate, 2026-08-19: "It would be nice to have the ability to see people that
 * have recently registered so that we know to welcome them ... I think we had 3
 * or 4 families who said they joined today and I can see the two on the
 * waitlist but have no way to know who the other ones are."
 *
 * users.created_at was already being read for the People page and thrown away
 * before the response was built, so nothing on any screen could answer this.
 */
describe('Recently joined', () => {
  it('filters to the people who joined this week, newest first', async () => {
    render(<RosterPage />)
    await screen.findByText('Ryder Swenson')

    fireEvent.click(screen.getByLabelText(/Joined in the last/))

    expect(screen.getByText('Erin Swenson')).toBeInTheDocument()
    expect(screen.queryByText('Ryder Swenson')).not.toBeInTheDocument()
  })

  it('flags a new arrival in the list without filtering', async () => {
    render(<RosterPage />)
    await screen.findByText('Ryder Swenson')
    expect(screen.getByText('new')).toBeInTheDocument()
  })
})
