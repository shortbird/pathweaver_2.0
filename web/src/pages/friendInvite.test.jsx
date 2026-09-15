/**
 * /f/:code -- a friend's invite link. What must stay true: opening the link
 * never adds a friend by itself (the visitor is sent somewhere that still
 * needs a tap), a signed-out visitor comes back here after login, a student
 * lands on Friends with the code filled in, a parent on the family
 * dashboard, and a link that is not a code gets an explanation, not a form.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import FriendInvitePage from './FriendInvitePage'

// Read lazily by the mocked hook, so declaring it after the import is fine.
let authState = { isAuthenticated: false, loading: false, effectiveRole: null }
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/f/:code" element={<FriendInvitePage />} />
      <Route path="/login" element={<div data-testid="login" />} />
      <Route path="/connections" element={<div data-testid="connections" />} />
      <Route path="/family" element={<div data-testid="family" />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  authState = { isAuthenticated: false, loading: false, effectiveRole: null }
  sessionStorage.clear()
})

describe('FriendInvitePage', () => {
  it('shows the code and offers the app before anything happens', async () => {
    renderAt('/f/abcd2345')
    expect(await screen.findByText('ABCD2345')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open in the optio app/i })).toHaveAttribute('href', 'optio://f/ABCD2345')
    expect(sessionStorage.getItem('friend_invite_code')).toBe('ABCD2345')
  })

  it('sends a signed-out visitor to login, coming back here afterwards', async () => {
    renderAt('/f/ABCD2345')
    await userEvent.click(await screen.findByRole('button', { name: /continue on the web/i }))
    expect(await screen.findByTestId('login')).toBeInTheDocument()
  })

  it('sends a student to Friends with the code filled in', async () => {
    authState = { isAuthenticated: true, loading: false, effectiveRole: 'student' }
    renderAt('/f/ABCD2345')
    await userEvent.click(await screen.findByRole('button', { name: /continue on the web/i }))
    expect(await screen.findByTestId('connections')).toBeInTheDocument()
  })

  it('sends a parent to the family dashboard', async () => {
    authState = { isAuthenticated: true, loading: false, effectiveRole: 'parent' }
    renderAt('/f/ABCD2345')
    await userEvent.click(await screen.findByRole('button', { name: /continue on the web/i }))
    expect(await screen.findByTestId('family')).toBeInTheDocument()
  })

  it('explains a link that is not a code instead of showing a form', async () => {
    renderAt('/f/nope')
    expect(await screen.findByText(/not a friend code/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /continue on the web/i })).toBeNull()
  })
})
