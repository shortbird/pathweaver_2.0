import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OnFireDashboard from './OnFireDashboard'
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
  MagnifyingGlassIcon: (p) => <svg data-testid="search-icon" {...p} />,
  UsersIcon: (p) => <svg data-testid="users-icon" {...p} />,
  UserPlusIcon: (p) => <svg data-testid="userplus-icon" {...p} />,
  CheckCircleIcon: (p) => <svg data-testid="check-icon" {...p} />
}))

const ENROLLMENTS = [
  { enrollment_id: 'e1', student_id: 's1', course_id: 'course-1', student_name: 'Jordan Rivera', student_email: 'jordan@example.com', course_title: 'Build a Tiny Model House', enrolled_at: '2026-06-18T12:00:00Z', status: 'active' },
  { enrollment_id: 'e2', student_id: 's2', course_id: 'course-2', student_name: 'Sam Lee', student_email: 'sam@example.com', course_title: 'Launch a Store', enrolled_at: '2026-06-17T12:00:00Z', status: 'active' }
]

const COURSES = [
  { id: 'course-1', title: 'Build a Tiny Model House', status: 'published', visibility: 'public', organization_id: null, credit_subject: null }
]

const renderDash = () =>
  render(
    <MemoryRouter>
      <OnFireDashboard />
    </MemoryRouter>
  )

describe('OnFireDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { organization_id: 'org-1' } }
    api.get.mockImplementation((url) => {
      if (url.includes('course-enrollments')) return Promise.resolve({ data: { enrollments: ENROLLMENTS } })
      if (url.includes('/api/courses')) return Promise.resolve({ data: { courses: COURSES } })
      return Promise.resolve({ data: {} })
    })
  })

  it('loads active enrollments into the table', async () => {
    renderDash()
    expect(await screen.findByText('Jordan Rivera')).toBeInTheDocument()
    expect(screen.getByText('Sam Lee')).toBeInTheDocument()
    expect(screen.getByText('Build a Tiny Model House')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/admin/organizations/org-1/course-enrollments')
  })

  it('filters enrollments by search', async () => {
    renderDash()
    await screen.findByText('Jordan Rivera')
    fireEvent.change(screen.getByPlaceholderText(/search students or courses/i), { target: { value: 'sam' } })
    expect(screen.queryByText('Jordan Rivera')).not.toBeInTheDocument()
    expect(screen.getByText('Sam Lee')).toBeInTheDocument()
  })

  it('switches to the register tab and shows the form', async () => {
    renderDash()
    await screen.findByText('Jordan Rivera')
    fireEvent.click(screen.getByRole('button', { name: /register a student/i }))
    expect(await screen.findByPlaceholderText('Jordan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register & enroll/i })).toBeInTheDocument()
  })

  it('removes access after confirming', async () => {
    api.post.mockResolvedValue({ data: { success: true } })
    renderDash()
    await screen.findByText('Jordan Rivera')

    // Click the remove button in Jordan's row, then confirm in the modal
    fireEvent.click(screen.getAllByRole('button', { name: /remove access/i })[0])
    expect(await screen.findByText(/remove access\?/i)).toBeInTheDocument()
    // The modal's confirm button is the last "Remove access" button in the DOM
    const removeButtons = screen.getAllByRole('button', { name: /remove access/i })
    fireEvent.click(removeButtons[removeButtons.length - 1])

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/course-enrollments/remove',
      { student_id: 's1', course_id: 'course-1' }
    ))
    await waitFor(() => expect(screen.queryByText('Jordan Rivera')).not.toBeInTheDocument())
  })

  it('shows an empty state when there are no enrollments', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('course-enrollments')) return Promise.resolve({ data: { enrollments: [] } })
      return Promise.resolve({ data: { courses: [] } })
    })
    renderDash()
    expect(await screen.findByText(/no active enrollments yet/i)).toBeInTheDocument()
  })
})
