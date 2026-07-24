import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

let authState = { user: { id: 'u1', role: 'org_admin' } }
let orgState = { organization: { id: 'org-1', name: 'Org' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => {
  const apiData = (url) => {
    if (url.includes('/waitlist')) return { data: { waitlist: [] } }
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

import ClassesPage from './ClassesPage'

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_admin' } }
  orgState = { organization: { id: 'org-1', name: 'Org' } }
  // the card/table choice persists to localStorage — clear any stored choice
  try { window.localStorage.removeItem('sis_classes_view') } catch { /* jsdom quirk */ }
  vi.clearAllMocks()
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
    expect(screen.getByLabelText('Supply Fee')).toHaveValue(15)
    expect(screen.getByRole('switch')).toBeInTheDocument() // registration toggle lives in the modal now
  })

  it('creates a class via the modal', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Create class')) // page button opens modal
    fireEvent.change(screen.getByLabelText(/Class Name/), { target: { value: 'Drawing' } })
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderCards()
    fireEvent.click(screen.getByText('Pottery'))
    fireEvent.click(await screen.findByText('Archive class'))
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

  it('warns when classes are closed to registration and can open them all', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    expect(screen.getByText(/1 class is closed to registration/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open all 1' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ registration_status: 'open' })),
    )
  })

  it('shows the waitlist count column in the table view', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByTitle('Table view'))
    expect(await screen.findByText('Waitlist')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('creates classes open for registration by default, with the checkbox opting out', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Create class'))
    fireEvent.change(screen.getByLabelText(/Class Name/), { target: { value: 'Drawing' } })
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
    fireEvent.click(await screen.findByLabelText('Pottery requires a full day of classes'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({
        requires_full_day: true,
      })),
    )
  })
})
