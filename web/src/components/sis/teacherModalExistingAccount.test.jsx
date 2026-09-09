/**
 * Adding a teacher whose email already has an Optio account.
 *
 * iCreate, 2026-08-05: "When I try to add a teacher who is also a parent, it
 * just says 'a user with this email already exists' but it won't let me add
 * them as a teacher." One person, one login, both roles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import TeacherModal from './TeacherModal'

const EXISTING = { id: 'u-9', name: 'Mo Parent', email: 'mom@real.com', roles: ['parent'] }

const fillEmailAndSubmit = (email = 'mom@real.com') => {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: /add teacher/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { templates: [] } })
})

describe('add teacher — the email already has an account', () => {
  it('offers to add the role instead of dead-ending on "already exists"', async () => {
    api.post.mockResolvedValueOnce({ data: { existing_account: EXISTING } })
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={vi.fn()} />)

    fillEmailAndSubmit()

    expect(await screen.findByText(/They already have an account/)).toBeInTheDocument()
    // Says who it is and what happens, rather than reporting a collision.
    expect(screen.getByText(/is already a parent here/)).toBeInTheDocument()
    expect(screen.queryByText(/already exists/)).not.toBeInTheDocument()
  })

  it('grants the teacher role to that account', async () => {
    const onSaved = vi.fn()
    api.post
      .mockResolvedValueOnce({ data: { existing_account: EXISTING } })
      .mockResolvedValueOnce({ data: { granted: true, roles: ['advisor', 'parent'] } })
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={onSaved} />)

    fillEmailAndSubmit()
    fireEvent.click(await screen.findByRole('button', { name: /Make them a teacher/ }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[1]
    expect(url).toBe('/api/sis/staff/grant-role')
    expect(body).toMatchObject({ user_id: 'u-9', organization_id: 'org-1' })
  })

  it('reports a refusal instead of pretending the role was added', async () => {
    api.post
      .mockResolvedValueOnce({ data: { existing_account: EXISTING } })
      .mockRejectedValueOnce({ response: { data: { error: 'This email belongs to a student account' } } })
    const onSaved = vi.fn()
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={onSaved} />)

    fillEmailAndSubmit()
    fireEvent.click(await screen.findByRole('button', { name: /Make them a teacher/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This email belongs to a student account')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('still creates a new teacher when the email is free', async () => {
    const onSaved = vi.fn()
    api.post.mockResolvedValueOnce({ data: { teacher: { id: 'new-1' }, email_sent: true } })
    render(<TeacherModal orgId="org-1" onClose={vi.fn()} onSaved={onSaved} />)

    fillEmailAndSubmit('brand.new@real.com')

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(screen.queryByText(/They already have an account/)).not.toBeInTheDocument()
  })
})
