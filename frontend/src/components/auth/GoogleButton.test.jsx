import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GoogleButton from './GoogleButton'

vi.mock('../../services/authService', () => ({
  default: {
    signInWithGoogle: vi.fn()
  }
}))

import authService from '../../services/authService'

describe('GoogleButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders "Sign in with Google" for signin mode', () => {
    render(<GoogleButton mode="signin" />)
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument()
  })

  it('renders "Sign up with Google" for signup mode', () => {
    render(<GoogleButton mode="signup" />)
    expect(screen.getByText('Sign up with Google')).toBeInTheDocument()
  })

  it('calls authService.signInWithGoogle on click', async () => {
    authService.signInWithGoogle.mockResolvedValue({ success: true, redirecting: true })
    render(<GoogleButton mode="signin" />)

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(authService.signInWithGoogle).toHaveBeenCalledTimes(1)
    })
  })

  it('shows "Connecting..." while loading', async () => {
    let resolvePromise
    authService.signInWithGoogle.mockReturnValue(new Promise(resolve => { resolvePromise = resolve }))

    render(<GoogleButton mode="signin" />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Connecting...')).toBeInTheDocument()
    })

    resolvePromise({ success: true, redirecting: true })
  })

  it('is disabled when disabled prop is true', () => {
    render(<GoogleButton mode="signin" disabled={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('calls onError when signInWithGoogle fails', async () => {
    const onError = vi.fn()
    authService.signInWithGoogle.mockResolvedValue({ success: false, redirecting: false, error: 'OAuth failed' })

    render(<GoogleButton mode="signin" onError={onError} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('OAuth failed')
    })
  })

  it('calls onError when signInWithGoogle throws', async () => {
    const onError = vi.fn()
    authService.signInWithGoogle.mockRejectedValue(new Error('Network error'))

    render(<GoogleButton mode="signin" onError={onError} />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Network error')
    })
  })

  it('stores promoCode in localStorage before redirect', async () => {
    authService.signInWithGoogle.mockResolvedValue({ success: true, redirecting: true })
    render(<GoogleButton mode="signup" promoCode="PROMO123" />)

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(localStorage.getItem('pendingPromoCode')).toBe('PROMO123')
    })
  })
})
