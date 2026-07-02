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
          meetings: [], primary_instructor_id: 's1', price_cents: 12000,
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
  vi.clearAllMocks()
})

describe('ClassesPage', () => {
  it('lists class cards and opens the editor modal with the class data', async () => {
    render(<ClassesPage />)
    expect(await screen.findByText('Pottery')).toBeInTheDocument()
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
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Pottery')) // card opens the editor modal
    fireEvent.change(await screen.findByDisplayValue('Pottery'), { target: { value: 'Pottery II' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ name: 'Pottery II' })),
    )
  })

  it('toggles registration status from the card modal', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Pottery'))
    fireEvent.click(await screen.findByRole('switch'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/sis/classes/c1', expect.objectContaining({ registration_status: 'open' })),
    )
  })

  it('archives a class after confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText('Pottery'))
    fireEvent.click(await screen.findByText('Archive class'))
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(expect.stringContaining('/api/sis/classes/c1')),
    )
  })

  it('opens the course modal with Details and Enrollments tabs only', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery') // default view = org classes
    fireEvent.click(screen.getByText(/^Optio Courses \(/))
    fireEvent.click(await screen.findByText('Intro to Robotics')) // card opens the detail modal
    expect(await screen.findByText('Details')).toBeInTheDocument()
    expect(screen.getByText('Enrollments')).toBeInTheDocument()
    expect(screen.queryByText('Enroll student')).not.toBeInTheDocument()
  })

  it('manages enrollments from the modal tab', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText(/^Optio Courses \(/))
    fireEvent.click(await screen.findByText('Intro to Robotics'))
    fireEvent.click(await screen.findByText('Enrollments')) // tab inside the modal
    expect(await screen.findByText('Enroll Users')).toBeInTheDocument() // embedded manager sub-tabs
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/admin/courses/crs1/enrollable-users')),
    )
  })

  it('shows the class teacher and tuition in the modal, and includes them in edits', async () => {
    render(<ClassesPage />)
    await screen.findByText('Pottery')
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
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText(/^Optio Courses \(/))
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
    render(<ClassesPage />)
    await screen.findByText('Pottery')
    fireEvent.click(screen.getByText(/^Optio Courses \(/))
    expect(screen.getByText('Intro to Robotics')).toBeInTheDocument()
    expect(screen.queryByText('Pottery')).not.toBeInTheDocument()
  })
})
