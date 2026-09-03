import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{withConfirm(ui)}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
// The page calls both toast.success/error and bare toast(msg, {icon}) (the
// double-booking warning), so the mock must be callable itself.
const { toastMock } = vi.hoisted(() => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { toastMock: t }
})
vi.mock('react-hot-toast', () => ({ toast: toastMock, default: toastMock }))

const { api, apiData, conflictRows } = vi.hoisted(() => {
  const conflictRows = [] // teacher double-bookings served by the mock API; tests push rows
  const apiData = (url) => {
    if (url.includes('/waitlist')) return { data: { waitlist: [] } }
    if (url.includes('/api/sis/teacher-conflicts')) return { data: { conflicts: [...conflictRows] } }
    if (url.includes('/api/courses')) {
      return { data: { courses: [
        { id: 'crs1', title: 'Intro to Robotics', description: 'Build robots', status: 'published',
          visibility: 'public', organization_id: 'other-org', age_range: '10-14', estimated_hours: 12 },
      ] } }
    }
    if (url.includes('/api/sis/course-settings')) {
      return { data: {
        course_settings: [{ course_id: 'crs1', teacher: { id: 's1', name: 'Jane Doe' } }],
        optio_course_tuition_cents: 25000, // one org-wide price for all Optio courses
      } }
    }
    // Rooms + school-day blocks for the editor's pickers. Served by a SIS
    // route, not the org_admin-gated /api/admin/organizations/:id, so a campus
    // coordinator gets them too.
    if (url.includes('/api/sis/schedule-settings')) {
      return { data: {
        rooms: [
          { name: 'Art Studio', description: 'Upstairs. 12 students' },
          { name: 'Kitchen', description: 'Cooking classroom' },
        ],
        time_blocks: [],
      } }
    }
    if (url.includes('/api/sis/staff')) {
      return { data: { staff: [
        { id: 's1', name: 'Jane Doe', roles: ['advisor'] },
        { id: 's2', name: 'Sam Lee', roles: ['advisor'] },
      ] } }
    }
    if (url.includes('/api/sis/classes')) {
      return { data: { classes: [
        { id: 'c1', name: 'Pottery', description: 'Clay', enrolled_count: 2, capacity: 10,
          supply_fee: 15, min_age: 8, max_age: 12, is_full: false, registration_status: 'closed',
          waitlist_count: 3, meetings: [], primary_instructor_id: 's1', price_cents: 12000,
          primary_instructor: { id: 's1', name: 'Jane Doe' } },
      ] } }
    }
    return { data: {} }
  }
  return {
    conflictRows,
    apiData,
    api: {
      get: vi.fn((url) => Promise.resolve(apiData(url))),
      post: vi.fn(() => Promise.resolve({ data: { class: { id: 'c2' } } })),
      patch: vi.fn(() => Promise.resolve({ data: { class: { id: 'c1' } } })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

// The student view itself is covered by CourseHomepage.test.jsx; here we only
// care that the SIS entry points hand it the right course.
vi.mock('../../pages/courses/CourseHomepage', () => ({
  default: ({ courseId, preview }) => (
    <div data-testid="course-student-view">{courseId}{preview ? ' preview' : ''}</div>
  ),
}))

import ClassesPage from './ClassesPage'
import { withConfirm, answerConfirm, confirmText } from '../../tests/confirmTestUtils'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  // view + export choices persist to localStorage — clear any stored choice
  try {
    window.localStorage.removeItem('sis_classes_view')
    window.localStorage.removeItem('sis_classes_export')
  } catch { /* jsdom quirk */ }
  conflictRows.length = 0
  vi.clearAllMocks()
  // A few specs replace api.get's implementation wholesale; clearAllMocks
  // does not undo that, so restore the default before every test.
  api.get.mockImplementation((url) => Promise.resolve(apiData(url)))
})

// Card-view specs: render and switch to cards (table is the default view).
// localStorage isn't dependable in this jsdom env, so click the toggle instead.
const renderCards = async () => {
  render(<ClassesPage />)
  await screen.findByText('Pottery')
  const btn = screen.getByTitle('Card view')
  if (btn.getAttribute('aria-pressed') !== 'true') fireEvent.click(btn)
  await screen.findByText('Pottery')
}

describe('ClassesPage', () => {
  it('defaults to the table view when no preference is stored', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    expect(screen.getByTitle('Table view')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Jane Doe')).toBeInTheDocument() // table shows the teacher column
  })

  it('lists class cards and opens the editor modal with the class data', async () => {
    await renderCards()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/classes'))
    fireEvent.click(screen.getByText('Pottery')) // card opens the editor modal
    expect(await screen.findByDisplayValue('Pottery')).toBeInTheDocument() // name field
    expect(screen.getByLabelText('Tuition')).toHaveValue(120)
    expect(screen.getByLabelText('Supply fee')).toHaveValue(15)
    expect(screen.getByRole('switch')).toBeInTheDocument() // registration toggle lives in the modal now
  })

  it('creates a class via the modal', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Create class')) // page button opens modal
    fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Drawing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' })) // modal submit
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/classes', expect.objectContaining({
        name: 'Drawing', organization_id: 'org-1',
      })),
    )
  })

  it('edits a class via the card modal', async () => {
    await renderCards()
    fireEvent.click(screen.getByText('Pottery')) // card opens the editor modal
    fireEvent.change(await screen.findByDisplayValue('Pottery'), { target: { value: 'Pottery II' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ name: 'Pottery II' })),
    )
  })

  it('toggles registration status from the card modal', async () => {
    await renderCards()
    fireEvent.click(screen.getByText('Pottery'))
    fireEvent.click(await screen.findByRole('switch'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ registration_status: 'open' })),
    )
  })

  it('archives a class after confirm', async () => {
    await renderCards()
    fireEvent.click(screen.getByText('Pottery'))
    fireEvent.click(await screen.findByText('Archive class'))
    await answerConfirm()
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(expect.stringContaining('/api/sis/classes/c1')),
    )
  })

  it('opens the course modal with Details and Enrollments tabs only', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('button', { name: /Optio courses/i }))
    fireEvent.click(await screen.findByText('Intro to Robotics')) // card opens the detail modal
    expect(await screen.findByText('Details')).toBeInTheDocument()
    expect(screen.getByText('Enrollments')).toBeInTheDocument()
    expect(screen.queryByText('Enroll student')).not.toBeInTheDocument()
  })

  it('manages enrollments from the modal tab', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('button', { name: /Optio courses/i }))
    fireEvent.click(await screen.findByText('Intro to Robotics'))
    fireEvent.click(await screen.findByText('Enrollments')) // tab inside the modal
    expect(await screen.findByText('Enroll Users')).toBeInTheDocument() // embedded manager sub-tabs
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/admin/courses/crs1/enrollable-users')),
    )
  })

  it('shows the class teacher and tuition in the modal, and includes them in edits', async () => {
    await renderCards()
    fireEvent.click(screen.getByText('Pottery')) // card opens the editor modal
    expect(await screen.findByPlaceholderText('Search staff…')).toHaveValue('Jane Doe') // current teacher
    fireEvent.change(screen.getByLabelText('Tuition'), { target: { value: '150' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({
        primary_instructor_id: 's1', price_cents: 15000,
      })),
    )
  })

  it('shows course details and reassigns the teacher via the card modal', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('button', { name: /Optio courses/i }))
    fireEvent.click(await screen.findByText('Intro to Robotics')) // card opens the detail modal
    expect(screen.queryByText('$250.00')).not.toBeInTheDocument() // tuition is parent-facing only, not shown in SIS
    expect(screen.getByPlaceholderText('Search staff…')).toHaveValue('Jane Doe') // current teacher prefilled
    fireEvent.focus(screen.getByPlaceholderText('Search staff…'))
    fireEvent.change(screen.getByPlaceholderText('Search staff…'), { target: { value: 'Sam' } })
    fireEvent.mouseDown(await screen.findByText('Sam Lee')) // SearchSelect options pick on mousedown
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/sis/courses/crs1/settings', expect.objectContaining({
        teacher_id: 's2',
      })),
    )
  })

  // Org admins review an Optio course by opening it in the real student view
  // (the same CourseHomepage the web platform's "View" button opens), so what
  // they review and demo is exactly what students get.
  it('opens the course in the student view from the card', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('button', { name: /Optio courses/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'View' }))
    expect(await screen.findByTestId('course-student-view')).toHaveTextContent('crs1')
    expect(screen.getByText(/exactly what your students see/i)).toBeInTheDocument()
  })

  it('opens the course in the student view from the detail modal', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('button', { name: /Optio courses/i }))
    fireEvent.click(await screen.findByText('Intro to Robotics')) // card body opens settings
    fireEvent.click(await screen.findByRole('button', { name: 'View as student' }))
    expect(await screen.findByTestId('course-student-view')).toHaveTextContent('crs1')
  })

  it('filters to courses only', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('button', { name: /Optio courses/i }))
    expect(screen.getByText('Intro to Robotics')).toBeInTheDocument()
    expect(screen.queryByText('Pottery')).not.toBeInTheDocument()
  })

  it('switches to the table view: compact rows that expand into an inline editor', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    // compact row shows the basics (courses are not in the table)
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('2/10')).toBeInTheDocument()
    expect(screen.queryByText('Intro to Robotics')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Clay')).not.toBeInTheDocument() // collapsed = no editor
    // clicking the row expands every attribute as editable fields
    fireEvent.click(screen.getByText('Pottery'))
    expect(await screen.findByDisplayValue('Pottery')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Clay')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search staff…')).toHaveValue('Jane Doe')
    expect(screen.getByLabelText('Capacity')).toHaveValue(10)
    expect(screen.getByLabelText('Tuition')).toHaveValue(120)
    expect(screen.getByLabelText('Supply fee')).toHaveValue(15)
    expect(screen.getByLabelText('Minimum age')).toHaveValue(8)
    expect(screen.getByLabelText('Maximum age')).toHaveValue(12)
    // clicking the row again collapses it
    fireEvent.click(screen.getByText('Pottery'))
    expect(screen.queryByDisplayValue('Clay')).not.toBeInTheDocument()
  })

  // The room picker's data comes from /api/sis/schedule-settings, NOT from the
  // org_admin-gated /api/admin/organizations/:id it used to read. A campus
  // coordinator is deliberately not an org_admin, so that call 403'd for them
  // and the editor fell back to a bare text box -- while a masquerading
  // superadmin, authorized as themselves, saw the dropdown and no bug.
  it('offers the school rooms in the expanded row, for a campus coordinator too', async () => {
    authState = { user: { id: 'u1', role: 'org_managed', org_roles: ['campus_coordinator'] } }
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    fireEvent.click(screen.getByText('Pottery'))

    const classroom = await screen.findByLabelText('Classroom')
    expect(classroom.tagName).toBe('SELECT')
    expect(screen.getByRole('option', { name: /Art Studio/ })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/sis/schedule-settings'))
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/admin/organizations'))
  })

  // iCreate, 2026-09-02: adding the Room column made the table wider than the
  // screen, and Save — spread to the far right of a justify-between bar — went
  // with it. "I can't see the SAVE button when I edit."
  it('keeps Save reachable when the table is wider than the screen', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    fireEvent.click(await screen.findByText('Pottery'))
    const save = await screen.findByRole('button', { name: 'Save' })
    // Pinned to the left edge of the scroll box rather than the right edge of
    // the table, so sideways scrolling never takes it off screen.
    const bar = save.closest('div').parentElement
    expect(bar.className).toContain('sticky')
    expect(bar.className).toContain('left-0')
    expect(bar.className).not.toContain('justify-between')
  })

  it('shows the room on the compact row and sorts on it', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    expect(await screen.findByRole('button', { name: /Room/ })).toBeInTheDocument()
  })

  it('edits an expanded row inline and saves it from the table view', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    fireEvent.click(await screen.findByText('Pottery'))
    fireEvent.change(await screen.findByDisplayValue('Pottery'), { target: { value: 'Pottery II' } })
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({
        name: 'Pottery II', capacity: 14,
      })),
    )
  })

  it('toggles registration from the expanded table row', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    fireEvent.click(await screen.findByText('Pottery'))
    fireEvent.click(await screen.findByRole('switch', { name: /Toggle registration for Pottery/ }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ registration_status: 'open' })),
    )
  })

  it('keeps the expanded row open when toggling registration (optimistic, no reload)', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    fireEvent.click(await screen.findByText('Pottery'))
    expect(await screen.findByDisplayValue('Clay')).toBeInTheDocument()
    const getCalls = api.get.mock.calls.length
    fireEvent.click(screen.getByRole('switch', { name: /Toggle registration for Pottery/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    // the row is still expanded, the toggle flipped in place, nothing refetched
    expect(screen.getByDisplayValue('Clay')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Toggle registration for Pottery/ })).toHaveAttribute('aria-checked', 'true')
    expect(api.get.mock.calls.length).toBe(getCalls)
  })

  it('marks closed classes per-row and can open them all at once', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    // The closed class is flagged on its own row/card, not in a page-level banner.
    expect(screen.getByText('Closed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open all' }))
    await answerConfirm()
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ registration_status: 'open' })),
    )
  })

  /**
   * iCreate, 2026-08-18: 'On this page it says "Open all 1 closed" but I
   * actually have no way of knowing what class is actually closed so idk how
   * to open it.' The count was the only mention of those classes anywhere, so
   * the bulk action was the only way to act on a set nobody could see.
   */
  it('the closed count filters the list down to those classes', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/classes')) {
        return Promise.resolve({ data: { classes: [
          { id: 'c1', name: 'Pottery', registration_status: 'closed', meetings: [] },
          { id: 'c2', name: 'Guitar Jam', registration_status: 'open', meetings: [] },
        ] } })
      }
      return Promise.resolve({ data: {} })
    })
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    expect(screen.getByText('Guitar Jam')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show 1 closed' }))
    expect(screen.getByText('Pottery')).toBeInTheDocument()          // closed
    expect(screen.queryByText('Guitar Jam')).not.toBeInTheDocument() // open

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(screen.getByText('Guitar Jam')).toBeInTheDocument()
  })

  it('opening them all clears the filter instead of leaving a blank page', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 closed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open all' }))
    await answerConfirm()
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    // The filter is off again, so the page is not left showing "nothing here".
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Clear filter' })).not.toBeInTheDocument())
  })

  it('shows the waitlist count column in the table view', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    expect(await screen.findByText('Waitlist')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  // iCreate, 2026-08-12: "I would love it more if I could select what I want
  // that spreadsheet to look like!" Export CSV now opens a chooser (formats +
  // columns) instead of downloading a fixed file. The chooser itself is covered
  // by classesExportModal.test.jsx; here we prove the toolbar wires it up.
  it('opens the export chooser and downloads the default CSV from it', async () => {
    let downloaded = ''
    const originalCreate = URL.createObjectURL
    URL.createObjectURL = vi.fn((blob) => { downloaded = blob._text || ''; return 'blob:mock' })
    URL.revokeObjectURL = vi.fn()
    const OriginalBlob = global.Blob
    global.Blob = class extends OriginalBlob {
      constructor(parts, opts) { super(parts, opts); this._text = (parts || []).join('') }
    }
    try {
      render(<ClassesPage />)
      await screen.findByText('Pottery')
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
      // The chooser is open — pick nothing, keep the defaults, export.
      fireEvent.click(await screen.findByRole('button', { name: 'Export' }))
      const [header, row] = downloaded.replace('﻿', '').split('\n')
      expect(header).toBe('Class name,Teacher,Days,Time,Ages,Description,Supply fee,Tuition,Classroom,Enrolled,Capacity,Waitlist')
      expect(row).toBe('Pottery,Jane Doe,,,8-12,Clay,$15,$120.00,,2,10,3')
    } finally {
      URL.createObjectURL = originalCreate
      global.Blob = OriginalBlob
    }
  })

  it('offers the next seat straight from a class row when a seat is open and someone is waiting', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    fireEvent.click(await screen.findByRole('button', { name: 'Offer next seat' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/classes/c1/waitlist/offer-next', { organization_id: 'org-1' }),
    )
  })

  // iCreate, 2026-07-31: "It says 'offer next seat' on brain games thurs for 1 on
  // the waitlist, but when I click on it it says no one is waiting." The count
  // includes students who already have an offer out; only a WAITING entry can be
  // offered, so the button must not appear for a queue that is entirely offered.
  it('hides the row offer-seat button when the whole waitlist is already offered', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/classes')) {
        return Promise.resolve({ data: { classes: [
          { id: 'c1', name: 'Brain Games', enrolled_count: 9, capacity: 12, is_full: false,
            registration_status: 'open', waitlist_count: 1, waitlist_waiting: 0,
            waitlist_offered: 1, meetings: [] },
        ] } })
      }
      if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: [] } })
      return Promise.resolve({ data: {} })
    })
    render(<ClassesPage />)
    await screen.findByText('Brain Games')
    fireEvent.click(screen.getByTitle('Table view'))
    await screen.findByText('Waitlist')
    expect(screen.queryByRole('button', { name: 'Offer next seat' })).not.toBeInTheDocument()
    // ...and the count says why, instead of looking like an unclicked button.
    expect(screen.getByText('offered')).toBeInTheDocument()
  })

  it('marks how much of a mixed waitlist is already offered', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/classes')) {
        return Promise.resolve({ data: { classes: [
          { id: 'c1', name: 'Brain Games', enrolled_count: 9, capacity: 12, is_full: false,
            registration_status: 'open', waitlist_count: 3, waitlist_waiting: 2,
            waitlist_offered: 1, meetings: [] },
        ] } })
      }
      if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: [] } })
      return Promise.resolve({ data: {} })
    })
    render(<ClassesPage />)
    await screen.findByText('Brain Games')
    fireEvent.click(screen.getByTitle('Table view'))
    expect(await screen.findByText('· 1 offered')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Offer next seat' })).toBeInTheDocument()
  })

  it('hides the row offer-seat button when the class is full', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/classes')) {
        return Promise.resolve({ data: { classes: [
          { id: 'c1', name: 'Pottery', enrolled_count: 10, capacity: 10, is_full: true,
            registration_status: 'open', waitlist_count: 3, meetings: [] },
        ] } })
      }
      if (url.includes('/waitlist')) return Promise.resolve({ data: { waitlist: [] } })
      return Promise.resolve({ data: {} })
    })
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    await screen.findByText('Waitlist')
    expect(screen.queryByRole('button', { name: 'Offer next seat' })).not.toBeInTheDocument()
  })

  it('creates classes open for registration by default, with the checkbox opting out', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Create class'))
    fireEvent.change(screen.getByLabelText('Class name'), { target: { value: 'Drawing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Class' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/sis/classes', expect.objectContaining({
        name: 'Drawing', registration_status: 'open',
      })),
    )
  })

  it('saves the full-day program flag from the expanded table row', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    fireEvent.click(await screen.findByText('Pottery'))
    // The label no longer names the class: the field lives inside that class's
    // own expanded panel now, and only one row is ever expanded.
    fireEvent.click(await screen.findByLabelText('Requires a full day of classes'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({
        requires_full_day: true,
      })),
    )
  })

  // Teacher double-booking cross-check (iCreate): the same person as primary
  // teacher on two classes that meet at the same time gets a standing banner,
  // and a save that causes it gets an immediate warning toast.
  const HOLLIE_CLASH = {
    teacher_id: 's1', teacher_name: 'Jane Doe',
    class_a_id: 'c1', class_a: 'Digital Art Studio',
    class_b_id: 'c9', class_b: 'Story Detectives',
    day_of_week: 4, start_time: '14:00', end_time: '15:00',
  }

  it('shows a banner when a teacher is double-booked across two classes', async () => {
    conflictRows.push(HOLLIE_CLASH)
    render(<ClassesPage />)
    await screen.findByText('Teacher double-booked')
    expect(screen.getByText(
      'Jane Doe is double-booked: Digital Art Studio and Story Detectives both meet Thursdays 2pm–3pm.',
    )).toBeInTheDocument()
  })

  it('shows no double-booking banner when schedules are clean', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    expect(screen.queryByText('Teacher double-booked')).not.toBeInTheDocument()
  })

  it('warns right after a save that double-books the teacher', async () => {
    await renderCards()
    conflictRows.push(HOLLIE_CLASH) // the clash appears once this save lands
    fireEvent.click(screen.getByText('Pottery'))
    fireEvent.change(await screen.findByDisplayValue('Pottery'), { target: { value: 'Digital Art Studio' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(
      'Jane Doe is double-booked: Digital Art Studio and Story Detectives both meet Thursdays 2pm–3pm.',
      expect.objectContaining({ icon: '⚠️' }),
    ))
  })

  it('filters classes when typing a teacher or assistant teacher name in search', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/api/sis/classes')) {
        return Promise.resolve({
          data: {
            classes: [
              {
                id: 'c1', name: 'Pottery', primary_instructor: { id: 's1', name: 'Jane Doe' },
                assistant_instructors: [], meetings: []
              },
              {
                id: 'c2', name: 'Woodworking', primary_instructor: { id: 's2', name: 'Sam Lee' },
                assistant_instructors: [{ id: 's3', name: 'Alex Assistant' }], meetings: []
              }
            ]
          }
        })
      }
      return Promise.resolve(apiData(url))
    })

    render(<ClassesPage />)
    await screen.findByText('Pottery')
    expect(screen.getByText('Woodworking')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText('Search…')

    // Search for primary instructor "Jane"
    fireEvent.change(searchInput, { target: { value: 'Jane' } })
    expect(screen.getByText('Pottery')).toBeInTheDocument()
    expect(screen.queryByText('Woodworking')).not.toBeInTheDocument()

    // Search for assistant instructor "Alex"
    fireEvent.change(searchInput, { target: { value: 'Alex' } })
    expect(screen.queryByText('Pottery')).not.toBeInTheDocument()
    expect(screen.getByText('Woodworking')).toBeInTheDocument()
  })
})
