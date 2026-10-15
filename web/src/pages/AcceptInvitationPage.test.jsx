// Ticket 93b118fa: the page used to POST each typed email to
// /invitations/check-email, a signed-out endpoint that said whether the email
// had an Optio account (accounts can be children's). The endpoint is gone. The
// page now always shows the name fields, says an existing account holder may
// leave them blank, and lets the accept route decide.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AcceptInvitationPage from './AcceptInvitationPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../components/auth/GoogleButton', () => ({
  default: () => <button type="button">Google</button>,
}))

vi.mock('../services/authService', () => ({ default: {} }))

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }))
vi.mock('../services/api', () => ({ default: { get: mockGet, post: mockPost } }))

const linkInvite = {
  is_link_based: true,
  role: 'parent',
  email: '',
  organization: { name: 'Test School', slug: 'test-school' },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/invitation/abc123']}>
      <Routes>
        <Route path="/invitation/:code" element={<AcceptInvitationPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AcceptInvitationPage (signed out, link-based invite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockImplementation((url) => {
      if (url === '/api/auth/me') return Promise.reject(new Error('401'))
      if (url.startsWith('/api/admin/organizations/invitations/validate/')) {
        return Promise.resolve({ data: { valid: true, invitation: linkInvite } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('shows the name fields with the leave-blank helper and never calls check-email', async () => {
    renderPage()
    const email = await screen.findByPlaceholderText('your@email.com')
    expect(screen.getByLabelText('First Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Last Name')).toBeInTheDocument()
    expect(screen.getByText('Already have an Optio account? You can leave your name blank.')).toBeInTheDocument()

    vi.useFakeTimers()
    fireEvent.change(email, { target: { value: 'someone@example.com' } })
    await act(async () => { vi.advanceTimersByTime(2000) })
    vi.useRealTimers()

    expect(mockPost).not.toHaveBeenCalled()
    expect(screen.getByLabelText('First Name')).toBeInTheDocument()
  })

  it('submits with blank names so the server can decide', async () => {
    mockPost.mockResolvedValue({ data: { success: true, existing_user: true } })
    renderPage()
    fireEvent.change(await screen.findByPlaceholderText('your@email.com'), { target: { value: 'pat@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText('Confirm your password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    const [url, body] = mockPost.mock.calls[0]
    expect(url).toBe('/api/admin/organizations/invitations/accept/abc123')
    expect(body).toMatchObject({ email: 'pat@example.com', first_name: '', last_name: '' })
    for (const call of mockPost.mock.calls) {
      expect(call[0]).not.toContain('check-email')
    }
  })

  it('shows the server error when a new account leaves the name blank', async () => {
    mockPost.mockRejectedValue({ response: { data: { error: 'First name and last name are required' } } })
    renderPage()
    fireEvent.change(await screen.findByPlaceholderText('your@email.com'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText('Confirm your password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByText('First name and last name are required')).toBeInTheDocument()
  })
})
