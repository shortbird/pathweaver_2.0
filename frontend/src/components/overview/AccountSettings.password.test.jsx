import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountSettings from './AccountSettings'

const post = vi.fn()
const setTokens = vi.fn()

vi.mock('../../services/api', () => ({
  default: { post: (...args) => post(...args), get: vi.fn(), put: vi.fn() },
  tokenStore: { setTokens: (...args) => setTokens(...args) }
}))
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

const user = { first_name: 'Jordan', last_name: 'Ray', email: 'jordan@example.com' }

const NEW_PASSWORD = 'Str0ng!NewPassword'

describe('AccountSettings — password', () => {
  beforeEach(() => {
    post.mockReset()
    setTokens.mockReset()
  })

  it('points people without a current password at Forgot password', () => {
    render(<AccountSettings user={user} hideHeader />)
    expect(screen.getByRole('link', { name: /forgot password/i }))
      .toHaveAttribute('href', '/forgot-password')
  })

  it('changes the password and stores the re-issued tokens', async () => {
    post.mockResolvedValue({
      data: { app_access_token: 'access-2', app_refresh_token: 'refresh-2' }
    })
    render(<AccountSettings user={user} hideHeader />)

    await userEvent.click(screen.getByRole('button', { name: /change/i }))
    await userEvent.type(screen.getByLabelText(/current password/i), 'OldPassw0rd!x')
    await userEvent.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD)
    await userEvent.type(screen.getByLabelText(/confirm new password/i), NEW_PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/auth/change-password', {
      current_password: 'OldPassw0rd!x',
      new_password: NEW_PASSWORD
    }))
    // Without this the Safari/iOS header-auth session dies on its next refresh.
    await waitFor(() => expect(setTokens).toHaveBeenCalledWith('access-2', 'refresh-2'))
  })

  it('will not submit when the confirmation does not match', async () => {
    render(<AccountSettings user={user} hideHeader />)

    await userEvent.click(screen.getByRole('button', { name: /change/i }))
    await userEvent.type(screen.getByLabelText(/current password/i), 'OldPassw0rd!x')
    await userEvent.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD)
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'Different!Pass1')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})
