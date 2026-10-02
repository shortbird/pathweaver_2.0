import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CreateAccountModal from './CreateAccountModal'

/**
 * Create Account (/admin/users). Org-only roles appear only once an org is
 * picked, clearing the org drops an org-only role back to student, and the
 * POST carries a null org for a platform account.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

const ORGS = [{ id: 'org-1', name: 'Hearthwood' }]

const roleValues = () =>
  Array.from(screen.getByLabelText('Role').querySelectorAll('option')).map((o) => o.value)

describe('CreateAccountModal', () => {
  beforeEach(() => {
    api.post.mockReset()
  })

  it('offers org-only roles only with an org', () => {
    render(<CreateAccountModal organizations={ORGS} onClose={vi.fn()} />)
    expect(roleValues()).not.toContain('org_admin')
    expect(roleValues()).not.toContain('superadmin')
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'org-1' } })
    expect(roleValues()).toContain('org_admin')
    expect(roleValues()).not.toContain('superadmin')
  })

  it('clearing the org resets an org-only role', () => {
    render(<CreateAccountModal organizations={ORGS} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'org-1' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'org_admin' } })
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: '' } })
    expect(screen.getByLabelText('Role').value).toBe('student')
  })

  it('posts a platform account with a null org', async () => {
    api.post.mockResolvedValue({ data: { email_sent: true, message: 'ok' } })
    const onCreated = vi.fn()
    render(<CreateAccountModal organizations={ORGS} onClose={vi.fn()} onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'parent' } })
    fireEvent.click(screen.getByText('Create and Send Email'))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/api/admin/users/create-by-email', expect.objectContaining({
      email: 'new@example.com', role: 'parent', organization_id: null,
    }))
  })

  it('shows the server refusal', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'An account with this email already exists.' } } })
    render(<CreateAccountModal organizations={ORGS} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'old@example.com' } })
    fireEvent.click(screen.getByText('Create and Send Email'))
    expect(await screen.findByText(/already exists/)).toBeInTheDocument()
  })
})
