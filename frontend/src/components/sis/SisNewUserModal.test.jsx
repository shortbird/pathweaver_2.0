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

import SisNewUserModal from './SisNewUserModal'

const setup = (props = {}) => {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(<SisNewUserModal orgId="org-1" onClose={onClose} onCreated={onCreated} {...props} />)
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
