import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { withConfirm, answerConfirm } from '../../tests/confirmTestUtils'
import api from '../../services/api'
import PartnerClassesCard from './PartnerClassesCard'

/**
 * A credit-class partner's card on its organization page: the buyer link, the
 * "Add a student" form, and the student list. An address that already belongs
 * to a parent makes the partner choose which child the class is for, because
 * putting it on the wrong one cannot be undone without deleting work.
 */

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('react-hot-toast', () => {
  const toast = { success: vi.fn(), error: vi.fn() }
  return { default: toast, toast }
})


const ORG = 'org-1'
const OFFERING = {
  id: 'off-1', slug: 'latticework', link: 'https://app.optioeducation.com/offer/latticework',
  title: 'Critical Thinking: The Latticework', subject_name: 'Language Arts', target_xp: 1000,
  students: [
    { enrollment_id: 'e1', user_id: 'u1', name: 'Kid Reader', email: 'kid@example.com',
      joined_at: '2026-09-30T12:00:00Z', xp: 120, review_status: null, removed_at: null },
  ],
}

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(withConfirm(
    <QueryClientProvider client={client}><PartnerClassesCard orgId={ORG} /></QueryClientProvider>
  ))
}

describe('PartnerClassesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { offerings: [OFFERING] } })
  })

  it('renders nothing for an org that sells no class', async () => {
    api.get.mockResolvedValue({ data: { offerings: [] } })
    const { container } = mount()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the buyer link and the students with their progress', async () => {
    mount()
    expect(await screen.findByDisplayValue(OFFERING.link)).toBeInTheDocument()
    expect(screen.getByText('Kid Reader')).toBeInTheDocument()
    expect(screen.getByText('120 / 1000 XP')).toBeInTheDocument()
    expect(screen.getByText('1 student', { exact: false })).toBeInTheDocument()
  })

  it('adds a new student', async () => {
    api.post.mockResolvedValue({ data: { created: true, is_new_account: true, email_sent: true,
      student: { name: 'New Kid' } } })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a student' }))
    await userEvent.type(screen.getByLabelText('First name'), 'New')
    await userEvent.type(screen.getByLabelText('Last name'), 'Kid')
    await userEvent.type(screen.getByLabelText('Student email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Date of birth'), '2010-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Add student' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      `/api/admin/organizations/${ORG}/partner-offerings/off-1/students`,
      { first_name: 'New', last_name: 'Kid', email: 'new@example.com', date_of_birth: '2010-01-01' }))
  })

  it("asks which child when the address is a parent's", async () => {
    api.post
      .mockRejectedValueOnce({ response: { data: { code: 'existing_account',
        error: 'mom@example.com already has an Optio account. Choose who the class is for.',
        students: [{ id: 'c1', name: 'Kid Reader', relationship: 'child' }] } } })
      .mockResolvedValueOnce({ data: { created: true, is_new_account: false, student: { name: 'Kid Reader' } } })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a student' }))
    await userEvent.type(screen.getByLabelText('First name'), 'Kid')
    await userEvent.type(screen.getByLabelText('Last name'), 'Reader')
    await userEvent.type(screen.getByLabelText('Student email'), 'mom@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add student' }))

    const submit = screen.getByRole('button', { name: 'Add student' })
    await screen.findByText('Who is the class for?')
    expect(submit).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/Kid Reader/))
    await userEvent.click(submit)
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith(
      expect.any(String), expect.objectContaining({ student_id: 'c1' })))
  })

  it('removes a student after an in-app confirmation', async () => {
    api.post.mockResolvedValue({ data: { success: true } })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    await answerConfirm()
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      `/api/admin/organizations/${ORG}/partner-offerings/off-1/students/e1/remove`, {}))
  })
})
