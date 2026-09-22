import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EnrollStudentForm from './EnrollStudentForm'
import api from '../../services/api'

/**
 * A partner selling a course to a family whose email already signs in to Optio.
 *
 * Megan Inama, 2026-09-22: "I have a student who apparently already has an
 * Optio account. I am not sure how you want me to handle this?" The form used
 * to end there. It now asks who the course is for and adds it to that student,
 * without adopting their account into the partner's org.
 */

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('@heroicons/react/24/outline', () => ({
  MagnifyingGlassIcon: (p) => <svg data-testid="search-icon" {...p} />,
  CheckCircleIcon: (p) => <svg data-testid="check-icon" {...p} />
}))

const COURSES = [
  { id: 'course-1', title: 'Design an Escape Room', status: 'published', visibility: 'public', organization_id: null, credit_subject: null }
]

const conflict = (data) => Object.assign(new Error('Conflict'), { response: { status: 409, data } })

const fillAndSubmit = async () => {
  fireEvent.change(screen.getByPlaceholderText('Jordan'), { target: { value: 'Publio' } })
  fireEvent.change(screen.getByPlaceholderText('Rivera'), { target: { value: 'Labrador' } })
  fireEvent.change(screen.getByPlaceholderText('student@example.com'), { target: { value: 'elviaroche01@gmail.com' } })
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: /register & enroll/i }))
}

describe('EnrollStudentForm, when the email already has an Optio account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { courses: COURSES } })
  })

  it('asks who the course is for instead of dead-ending', async () => {
    api.post.mockRejectedValueOnce(conflict({
      code: 'existing_account',
      error: 'elviaroche01@gmail.com already has an Optio account.',
      message: 'elviaroche01@gmail.com already has an Optio account. Choose who the course should be added to.',
      students: [{ id: 'child-1', name: 'Publio Labrador', relationship: 'child' }]
    }))

    render(<EnrollStudentForm orgId="org-1" />)
    await fillAndSubmit()

    expect(await screen.findByText(/this email already has an optio account/i)).toBeInTheDocument()
    expect(screen.getByText('Publio Labrador')).toBeInTheDocument()
    // The single candidate is preselected, so the confirm is one click.
    expect(screen.getByRole('radio')).toBeChecked()
  })

  it('adds the course to the chosen student and leaves their account alone', async () => {
    api.post
      .mockRejectedValueOnce(conflict({
        code: 'existing_account',
        message: 'elviaroche01@gmail.com already has an Optio account.',
        students: [{ id: 'child-1', name: 'Publio Labrador', relationship: 'child' }]
      }))
      .mockResolvedValueOnce({ data: {
        success: true,
        is_new_account: false,
        enrolled_student: { id: 'child-1', name: 'Publio Labrador', relationship: 'child' },
        courses: [{ course_id: 'course-1', course_title: 'Design an Escape Room', status: 'enrolled' }],
        email_to: 'elviaroche01@gmail.com',
        email_sent: true,
        message: "Publio Labrador's existing Optio account was enrolled in the selected course(s)."
      } })

    const onRegistered = vi.fn()
    render(<EnrollStudentForm orgId="org-1" onRegistered={onRegistered} />)
    await fillAndSubmit()

    fireEvent.click(await screen.findByRole('button', { name: /add to this account/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1]).toMatchObject({
      student_email: 'elviaroche01@gmail.com',
      course_ids: ['course-1'],
      student_id: 'child-1'
    })
    // The success view names the student Optio holds, not the one typed in.
    expect(await screen.findByText(/Publio Labrador is enrolled/i)).toBeInTheDocument()
    expect(onRegistered).toHaveBeenCalled()
  })

  it('returns to the form when the partner picks a different email', async () => {
    api.post.mockRejectedValueOnce(conflict({
      code: 'existing_account',
      message: 'elviaroche01@gmail.com already has an Optio account.',
      students: [{ id: 'child-1', name: 'Publio Labrador', relationship: 'child' }]
    }))

    render(<EnrollStudentForm orgId="org-1" />)
    await fillAndSubmit()

    fireEvent.click(await screen.findByRole('button', { name: /use a different email/i }))
    expect(await screen.findByRole('button', { name: /register & enroll/i })).toBeInTheDocument()
    // What was typed survives, so only the address has to change.
    expect(screen.getByPlaceholderText('student@example.com')).toHaveValue('elviaroche01@gmail.com')
  })

  it('shows the plain error when the account has no student on it', async () => {
    api.post.mockRejectedValueOnce(conflict({
      code: 'existing_account_no_student',
      error: 'advisor@example.com already signs in to Optio, but that account is not a student.'
    }))

    render(<EnrollStudentForm orgId="org-1" />)
    await fillAndSubmit()

    expect(await screen.findByText(/not a student/i)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})
