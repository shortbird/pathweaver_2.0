/**
 * A teacher can record their own phone number.
 *
 * iCreate, 2026-08-29, reported twice within an hour: "The teachers can't add
 * their own phone numbers. HELP!" and "I've been asked to add my phone number
 * to optio but I'm not sure where to do that."
 *
 * Nothing was broken — the field did not exist. The only phone input on this
 * page belonged to the emergency contact ("who your school should call if
 * something happens to you on site"), which is somebody else's number. The
 * backend had accepted the teacher's own all along: phone_number is in
 * SELF_PROFILE_FIELDS and is written through to users.phone_number.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), patch: vi.fn(), put: vi.fn(), post: vi.fn() }
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'teacher-1', display_name: 'Nicole' }, refreshUser: vi.fn() })
}))

vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1' }),
  withOrg: (url) => url
}))

vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (url) => url
}))

vi.mock('../../components/sis/BackToDashboard', () => ({ default: () => null }))

import api from '../../services/api'
import MyProfilePage from './MyProfilePage'

const profile = (overrides = {}) => ({
  data: {
    profile: {
      position: 'Teacher',
      phone_number: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      ...overrides
    }
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue(profile())
  api.patch.mockResolvedValue(profile())
})

describe('the teacher’s own phone number', () => {
  it('has its own field, separate from the emergency contact', async () => {
    render(<MyProfilePage />)
    expect(await screen.findByText('Your phone number')).toBeInTheDocument()
    // The emergency contact's number is still its own, differently-labelled field.
    expect(screen.getByText('Contact phone')).toBeInTheDocument()
  })

  it('shows the number already on file', async () => {
    api.get.mockResolvedValue(profile({ phone_number: '(555) 123-4567' }))
    render(<MyProfilePage />)
    await waitFor(() => expect(screen.getByDisplayValue('(555) 123-4567')).toBeInTheDocument())
  })

  it('saves it as phone_number', async () => {
    const user = userEvent.setup()
    render(<MyProfilePage />)
    await screen.findByText('Your phone number')

    const inputs = screen.getAllByPlaceholderText('e.g. (555) 123-4567')
    await user.type(inputs[0], '5551234567')
    await user.click(screen.getByRole('button', { name: /save contact details/i }))

    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [, body] = api.patch.mock.calls[0]
    expect(body.phone_number).toBe('5551234567')
  })

  it('does not put the teacher’s number in the emergency contact field', async () => {
    const user = userEvent.setup()
    render(<MyProfilePage />)
    await screen.findByText('Your phone number')

    const inputs = screen.getAllByPlaceholderText('e.g. (555) 123-4567')
    await user.type(inputs[0], '5551234567')
    await user.click(screen.getByRole('button', { name: /save contact details/i }))

    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [, body] = api.patch.mock.calls[0]
    expect(body.emergency_contact_phone).toBeNull()
  })

  it('makes the save button available once the number changes', async () => {
    const user = userEvent.setup()
    render(<MyProfilePage />)
    await screen.findByText('Your phone number')

    const saveButton = screen.getByRole('button', { name: /save contact details/i })
    expect(saveButton).toBeDisabled()

    await user.type(screen.getAllByPlaceholderText('e.g. (555) 123-4567')[0], '555')
    expect(saveButton).toBeEnabled()
  })

  it('clears to null rather than an empty string', async () => {
    const user = userEvent.setup()
    api.get.mockResolvedValue(profile({ phone_number: '5551234567' }))
    render(<MyProfilePage />)
    await waitFor(() => expect(screen.getByDisplayValue('5551234567')).toBeInTheDocument())

    await user.clear(screen.getByDisplayValue('5551234567'))
    await user.click(screen.getByRole('button', { name: /save contact details/i }))

    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][1].phone_number).toBeNull()
  })
})
