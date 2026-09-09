import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { post: vi.fn(() => Promise.resolve({ data: { success: true } })) },
}))
vi.mock('../../services/api', () => ({ default: api }))

// The modal reads the signed-in user to decide which roles it may offer, so the
// context is part of the fixture now.
vi.mock('../../contexts/AuthContext', async () => {
  const React = await import('react')
  return { AuthContext: React.createContext(null) }
})

import SisNewUserModal from './SisNewUserModal'
import { AuthContext as Ctx } from '../../contexts/AuthContext'

const ADMIN = { id: 'admin-1', role: 'org_managed', org_roles: ['org_admin'] }
const COORDINATOR = { id: 'kate', role: 'org_managed', org_roles: ['campus_coordinator'] }

const setup = (props = {}, user = ADMIN) => {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(
    <Ctx.Provider value={{ user }}>
      <SisNewUserModal orgId="org-1" onClose={onClose} onCreated={onCreated} {...props} />
    </Ctx.Provider>
  )
  return { onClose, onCreated }
}

beforeEach(() => vi.clearAllMocks())

describe('SisNewUserModal', () => {
  it('creates a username student and shows credentials', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        login_credentials: { username: 'john.doe', password: '1234apple', login_url: '/login/acme' },
        linked_to_parent: false,
      },
    })
    setup()

    fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: 'John' } })
    fireEvent.change(screen.getByPlaceholderText('Doe'), { target: { value: 'Doe' } })
    fireEvent.change(screen.getByPlaceholderText('john.doe'), { target: { value: 'john.doe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/users/create-username',
      expect.objectContaining({ username: 'john.doe', first_name: 'John', last_name: 'Doe', org_role: 'student' })
    ))
    expect(await screen.findByText('1234apple')).toBeInTheDocument()
  })

  it('passes link_to_me when the child checkbox is ticked', async () => {
    api.post.mockResolvedValueOnce({
      data: { login_credentials: { username: 'kid', password: 'pw', login_url: '/login/acme' }, linked_to_parent: true },
    })
    setup()
    fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: 'Kid' } })
    fireEvent.change(screen.getByPlaceholderText('Doe'), { target: { value: 'Christensen' } })
    fireEvent.change(screen.getByPlaceholderText('john.doe'), { target: { value: 'kid' } })
    fireEvent.click(screen.getByText(/This student is my own child/))
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ link_to_me: true })
    ))
    expect(await screen.findByText(/Linked to your account/)).toBeInTheDocument()
  })

  it('forces email invitation for org admins', async () => {
    const { onCreated, onClose } = setup()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'org_admin' } })
    expect(screen.getByText(/Org admins can only be added by email invitation/)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('user@example.com'), { target: { value: 'admin@x.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Invitation' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/invitations',
      expect.objectContaining({ email: 'admin@x.com', role: 'org_admin' })
    ))
    expect(onCreated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('validates required fields before creating', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }))
    expect(await screen.findByText('First name is required')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})

// A campus coordinator adds families all day; staff accounts are an admin's to
// create. Offering them the option and having the backend refuse it would be a
// worse answer than not offering it.
describe('SisNewUserModal for a campus coordinator', () => {
  it('offers the family roles only', () => {
    setup({}, COORDINATOR)
    const options = [...screen.getByRole('combobox').options].map((o) => o.value)
    expect(options).toEqual(['student', 'parent', 'observer'])
  })

  it('still offers an org admin every role', () => {
    setup({}, ADMIN)
    const options = [...screen.getByRole('combobox').options].map((o) => o.value)
    expect(options).toContain('advisor')
    expect(options).toContain('org_admin')
  })
})
