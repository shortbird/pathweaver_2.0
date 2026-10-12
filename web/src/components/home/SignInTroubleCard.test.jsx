import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SignInTroubleCard from './SignInTroubleCard'
import { describeTrouble } from '../common/SignInTroubleList'
import api from '../../services/api'
import { withConfirm, answerConfirm } from '../../tests/confirmTestUtils'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const people = [
  { email: 'mom@school.test', user_id: 'u1', name: 'Amy Harrison', role: 'parent',
    organization_name: 'iCreate', failures: 5, locked: true, was_locked: true,
    last_attempt: new Date().toISOString(), has_account: true },
  { email: 'mom@shcool.test', user_id: null, name: null, role: null, organization_name: null,
    failures: 2, locked: false, was_locked: false, last_attempt: new Date().toISOString(), has_account: false },
]

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{withConfirm(<SignInTroubleCard />)}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SignInTroubleCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('names the people, their school, and why', async () => {
    api.get.mockResolvedValue({ data: { people, window_days: 7 } })
    renderCard()
    const card = await screen.findByRole('region', { name: 'People who cannot sign in' })
    await waitFor(() => expect(card).toHaveTextContent('Amy Harrison'))
    expect(card).toHaveTextContent('Parent · iCreate · mom@school.test')
    expect(card).toHaveTextContent('Locked out now')
    expect(card).toHaveTextContent('No account with this email')
    expect(screen.getByRole('link', { name: 'Amy Harrison' }))
      .toHaveAttribute('href', '/admin/users?search=mom%40school.test')
    // Only a person with an account can have a password reset.
    expect(screen.getAllByRole('button', { name: 'Reset password' })).toHaveLength(1)
  })

  it('resets the password after a confirm', async () => {
    api.get.mockResolvedValue({ data: { people, window_days: 7 } })
    api.post.mockResolvedValue({ data: { new_password: 'changeme!' } })
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }))
    await answerConfirm(true)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/users/u1/reset-password', {}))
  })

  it('refetches the list without reloading the page', async () => {
    api.get.mockResolvedValue({ data: { people, window_days: 7 } })
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: /Updated .* · Refresh/ }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(api.get).toHaveBeenLastCalledWith('/api/admin/platform-metrics/sign-in-trouble')
  })

  it('says so when nobody is stuck', async () => {
    api.get.mockResolvedValue({ data: { people: [], window_days: 7 } })
    renderCard()
    expect(await screen.findByText('Nobody is stuck at sign-in this week.')).toBeInTheDocument()
  })
})

describe('describeTrouble', () => {
  it('puts a live lockout first', () => {
    expect(describeTrouble({ locked: true, failures: 5 })).toBe('Locked out now')
    expect(describeTrouble({ locked: false, was_locked: true, failures: 6 })).toBe('6 failed tries, was locked out')
    expect(describeTrouble({ failures: 2 })).toBe('2 failed tries')
  })
})
