import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  default: { post: vi.fn() }
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <svg data-testid="qr" />
}))

vi.mock('../../utils/credentialCardsPrinter', () => ({
  printCredentialCards: vi.fn()
}))

import api from '../../services/api'
import PrintLoginCardsModal from './PrintLoginCardsModal'

const mount = () => render(
  <PrintLoginCardsModal orgId="org-1" orgSlug="arete" orgName="Arete Academy" onClose={vi.fn()} />
)

describe('PrintLoginCardsModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('warns that generating cards resets every username password', () => {
    mount()
    expect(screen.getByText(/new password for every/i)).toBeInTheDocument()
    // Nothing is reset until the admin confirms.
    expect(api.post).not.toHaveBeenCalled()
  })

  it('calls the bulk reset endpoint on confirm and shows the credentials once', async () => {
    api.post.mockResolvedValue({
      data: {
        results: [
          { user_id: 'u1', name: 'Luke Hill', username: 'lukehill', password: '1234apple' }
        ],
        failed: []
      }
    })
    mount()
    await userEvent.click(screen.getByRole('button', { name: /generate new passwords/i }))

    expect(api.post).toHaveBeenCalledWith(
      '/api/admin/organizations/org-1/users/bulk-reset-passwords',
      {}
    )
    expect(await screen.findByText('lukehill')).toBeInTheDocument()
    expect(screen.getByText('1234apple')).toBeInTheDocument()
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument()
  })

  it('lists accounts whose reset failed so the admin knows the old password still works', async () => {
    api.post.mockResolvedValue({
      data: {
        results: [
          { user_id: 'u1', name: 'Luke Hill', username: 'lukehill', password: '1234apple' }
        ],
        failed: [{ user_id: 'u2', name: 'Jack Hill', username: 'jackhill' }]
      }
    })
    mount()
    await userEvent.click(screen.getByRole('button', { name: /generate new passwords/i }))

    expect(await screen.findByText(/could not be reset/i)).toBeInTheDocument()
    expect(screen.getByText(/Jack Hill/)).toBeInTheDocument()
  })

  it('handles an org with no username accounts', async () => {
    api.post.mockResolvedValue({
      data: { results: [], failed: [], message: 'No username-based accounts found' }
    })
    mount()
    await userEvent.click(screen.getByRole('button', { name: /generate new passwords/i }))
    expect(await screen.findByText(/No username-based accounts found/)).toBeInTheDocument()
  })

  it('surfaces a server error without leaving the confirm stage', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'Access denied' } } })
    mount()
    await userEvent.click(screen.getByRole('button', { name: /generate new passwords/i }))
    expect(await screen.findByText('Access denied')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate new passwords/i })).toBeInTheDocument()
  })
})
