import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import UnfinishedRegistrationBanner from '../UnfinishedRegistrationBanner'
import api from '../../../services/api'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn() },
}))

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAuthenticated: true }),
}))

const renderAt = (path = '/dashboard') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <UnfinishedRegistrationBanner />
    </MemoryRouter>
  </QueryClientProvider>
)

const answer = (registration) => api.get.mockResolvedValue({ data: { success: true, registration } })

describe('UnfinishedRegistrationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('offers the person who started it a way back into the funnel', async () => {
    answer({ kind: 'own', status: 'family', organization_name: 'Optio Academy' })
    renderAt()
    expect(await screen.findByText(/Optio Academy registration isn’t finished/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Finish registration' })).toHaveAttribute('href', '/enroll/resume')
    expect(api.get).toHaveBeenCalledWith('/api/registration/unfinished')
  })

  it('tells a child on someone else’s registration which account can finish it, with no button that would refuse them', async () => {
    answer({ kind: 'student', status: 'fee', organization_name: 'Optio Academy', registrant_email: 'mom@example.com' })
    renderAt()
    expect(await screen.findByText(/started from mom@example.com/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Finish registration' })).toBeNull()
  })

  it('shows nothing when there is nothing to finish', async () => {
    answer(null)
    renderAt()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('unfinished-registration-banner')).toBeNull()
  })

  it('stays out of the funnel itself', async () => {
    answer({ kind: 'own', status: 'family', organization_name: 'Optio Academy' })
    renderAt('/enroll/resume')
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('unfinished-registration-banner')).toBeNull()
  })

  it('can be dismissed for the rest of the session', async () => {
    answer({ kind: 'own', status: 'family', organization_name: 'Optio Academy' })
    const { unmount } = renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('unfinished-registration-banner')).toBeNull()
    unmount()
    renderAt()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('unfinished-registration-banner')).toBeNull()
  })
})
