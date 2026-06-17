import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PartnerEnrollStudentPage from './PartnerEnrollStudentPage'
import api from '../services/api'

let authState = { user: { organization_id: 'org-1' } }

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@heroicons/react/24/outline', () => ({
  MagnifyingGlassIcon: (props) => <svg data-testid="search-icon" {...props} />,
  CheckCircleIcon: (props) => <svg data-testid="check-icon" {...props} />
}))

const COURSES = [
  { id: 'course-1', title: 'Build a Tiny Model House', status: 'published', visibility: 'public', organization_id: null, credit_subject: null },
  { id: 'course-2', title: 'Launch a Store', status: 'published', visibility: 'public', organization_id: null, credit_subject: null },
  // Should be filtered out of the selectable list:
  { id: 'course-py', title: 'Python 1', status: 'published', visibility: 'public', organization_id: null, credit_subject: 'Computer Science' },
  { id: 'course-hist', title: 'HIST 1301: U.S. History', status: 'published', visibility: 'organization', organization_id: null, credit_subject: null }
]

const renderPage = () =>
  render(
    <MemoryRouter>
      <PartnerEnrollStudentPage />
    </MemoryRouter>
  )

const fillStudent = () => {
  fireEvent.change(screen.getByPlaceholderText('Jordan'), { target: { value: 'Jordan' } })
  fireEvent.change(screen.getByPlaceholderText('Rivera'), { target: { value: 'Rivera' } })
  fireEvent.change(screen.getByPlaceholderText('student@example.com'), { target: { value: 'kid@example.com' } })
}

describe('PartnerEnrollStudentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { organization_id: 'org-1' } }
    api.get.mockResolvedValue({ data: { courses: COURSES } })
  })

  it('lists selectable courses and excludes credit/college classes', async () => {
    renderPage()
    expect(await screen.findByText('Build a Tiny Model House')).toBeInTheDocument()
    expect(screen.getByText('Launch a Store')).toBeInTheDocument()
    // Credit-bearing ("Python 1") and college-code/org-only courses are hidden
    expect(screen.queryByText('Python 1')).not.toBeInTheDocument()
    expect(screen.queryByText('HIST 1301: U.S. History')).not.toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/courses?filter=all')
  })

  it('requires at least one course', async () => {
    renderPage()
    await screen.findByText('Build a Tiny Model House')
    fillStudent()
    fireEvent.click(screen.getByRole('button', { name: /register & enroll/i }))
    expect(await screen.findByText(/select at least one course/i)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('submits selected course_ids and shows credentials for a new account', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true,
        is_new_account: true,
        message: 'Student registered and enrolled.',
        login_credentials: { email: 'kid@example.com', password: 'TempPass123!' },
        courses: [
          { course_id: 'course-1', course_title: 'Build a Tiny Model House', status: 'enrolled' },
          { course_id: 'course-2', course_title: 'Launch a Store', status: 'enrolled' }
        ],
        email_to: 'kid@example.com',
        email_sent: true
      }
    })

    renderPage()
    await screen.findByText('Build a Tiny Model House')
    fillStudent()
    fireEvent.click(screen.getByRole('checkbox', { name: /Build a Tiny Model House/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Launch a Store/i }))
    fireEvent.click(screen.getByRole('button', { name: /register & enroll/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/register-student-for-course',
      expect.objectContaining({
        first_name: 'Jordan',
        student_email: 'kid@example.com',
        course_ids: ['course-1', 'course-2']
      })
    ))

    expect(await screen.findByText(/is registered/i)).toBeInTheDocument()
    expect(screen.getByText('TempPass123!')).toBeInTheDocument()
  })

  it('shows the returning-student path without credentials', async () => {
    api.post.mockResolvedValue({
      data: {
        success: true,
        is_new_account: false,
        message: 'Existing student enrolled in the selected course(s).',
        courses: [
          { course_id: 'course-2', course_title: 'Launch a Store', status: 'enrolled' }
        ],
        email_to: 'kid@example.com',
        email_sent: true
      }
    })

    renderPage()
    await screen.findByText('Build a Tiny Model House')
    fillStudent()
    fireEvent.click(screen.getByRole('checkbox', { name: /Launch a Store/i }))
    fireEvent.click(screen.getByRole('button', { name: /register & enroll/i }))

    expect(await screen.findByText(/is enrolled/i)).toBeInTheDocument()
    expect(screen.queryByText(/Temporary Password/i)).not.toBeInTheDocument()
  })

  it('surfaces a backend conflict error', async () => {
    api.post.mockRejectedValue({ response: { data: { error: "An account already exists for kid@example.com outside this program, so it can't be registered here." } } })
    renderPage()
    await screen.findByText('Build a Tiny Model House')
    fillStudent()
    fireEvent.click(screen.getByRole('checkbox', { name: /Build a Tiny Model House/i }))
    fireEvent.click(screen.getByRole('button', { name: /register & enroll/i }))
    expect(await screen.findByText(/outside this program/i)).toBeInTheDocument()
  })
})
