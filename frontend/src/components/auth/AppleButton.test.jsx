import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AppleButton from './AppleButton'

vi.mock('../../services/authService', () => ({
  default: {
    signInWithApple: vi.fn()
  }
}))

import authService from '../../services/authService'

describe('AppleButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders "Sign in with Apple" for signin mode', () => {
    render(<AppleButton mode="signin" />)
    expect(screen.getByText('Sign in with Apple')).toBeInTheDocument()
  })

  it('renders "Sign up with Apple" for signup mode', () => {
    render(<AppleButton mode="signup" />)
    expect(screen.getByText('Sign up with Apple')).toBeInTheDocument()
  })

  it('calls authService.signInWithApple on click', async () => {
    authService.signInWithApple.mockResolvedValue({ success: true, redirecting: true })
    render(<AppleButton mode="signin" />)

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(authService.signInWithApple).toHaveBeenCalledTimes(1)
    })
  })

  it('shows "Connecting..." while loading', async () => {
    let resolvePromise
    authService.signInWithApple.mockReturnValue(new Promise(resolve => { resolvePromise = resolve }))

    render(<AppleButton mode="signin" />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Connecting...')).toBeInTheDocument()
    })

    resolvePromise({ success: true, redirecting: true })
  })

  it('is disabled when disabled prop is true', () => {
    render(<AppleButton mode="signin" disabled={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onError when signInWithApple fails', async () => {
    const onError = vi.fn()
    authService.signInWithApple.mockResolvedValue({ success: false, redirecting: false, error: 'OAuth failed' })

    render(<AppleButton mode="signin" onError={onError} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('OAuth failed')
    })
  })

  it('calls onError when signInWithApple throws', async () => {
    const onError = vi.fn()
    authService.signInWithApple.mockRejectedValue(new Error('Network error'))

    render(<AppleButton mode="signin" onError={onError} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Network error')
    })
  })

  it('stores pending codes in localStorage before redirect', async () => {
    authService.signInWithApple.mockResolvedValue({ success: true, redirecting: true })
    render(<AppleButton mode="signup" promoCode="PROMO123" invitationCode="INV1" orgInvitationCode="ORG1" registrationCode="optio-academy" />)

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(localStorage.getItem('pendingPromoCode')).toBe('PROMO123')
    })
    expect(localStorage.getItem('pendingObserverInvitation')).toBe('INV1')
    expect(localStorage.getItem('pendingOrgInvitation')).toBe('ORG1')
    // The parent registration funnel's code, which /auth/callback spends to
    // attach a passwordless account to the school (registrationFunnelResume).
    expect(localStorage.getItem('pendingRegistrationFunnel')).toBe('optio-academy')
  })

  it('clears pending codes when the redirect never happens', async () => {
    authService.signInWithApple.mockResolvedValue({ success: false, redirecting: false, error: 'nope' })
    render(<AppleButton mode="signup" promoCode="PROMO123" />)

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(localStorage.getItem('pendingPromoCode')).toBeNull()
    })
  })
})
