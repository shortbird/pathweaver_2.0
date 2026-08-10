import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MarketingNav from './MarketingNav'

let authState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../../services/posthog', () => ({
  captureEvent: vi.fn()
}))

const writeLogin = (userId) =>
  localStorage.setItem('session_sync', JSON.stringify({ userId, action: 'login', timestamp: 1 }))

function renderNav() {
  return render(
    <MemoryRouter>
      <MarketingNav />
    </MemoryRouter>
  )
}

// The marketing header is the thing that made signed-in users believe they were
// logged out: it offered "Login" to people with a live session. Signed-in users
// get a single way back into the app instead.
describe('MarketingNav auth awareness', () => {
  beforeEach(() => {
    localStorage.clear()
    authState = { isAuthenticated: false, user: null, loading: false }
  })

  it('shows Login and Create Free Account to anonymous visitors', () => {
    renderNav()
    expect(screen.getAllByRole('link', { name: 'Login' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Create Free Account' }).length).toBeGreaterThan(0)
  })

  it('replaces the auth CTAs with a dashboard link for signed-in users', () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'student' } }
    renderNav()
    const dashLinks = screen.getAllByRole('link', { name: 'Go to my dashboard' })
    expect(dashLinks.length).toBeGreaterThan(0)
    dashLinks.forEach((link) => expect(link).toHaveAttribute('href', '/dashboard'))
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create Free Account' })).not.toBeInTheDocument()
  })

  it('points the dashboard link at the role home (parent)', () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'parent' } }
    renderNav()
    screen.getAllByRole('link', { name: 'Go to my dashboard' })
      .forEach((link) => expect(link).toHaveAttribute('href', '/parent/dashboard'))
  })

  it('shows neither CTA while a probable session is still resolving', () => {
    writeLogin('u1')
    authState = { isAuthenticated: false, user: null, loading: true }
    renderNav()
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Go to my dashboard' })).not.toBeInTheDocument()
  })

  it('shows the anonymous CTAs during load when there is no session hint', () => {
    authState = { isAuthenticated: false, user: null, loading: true }
    renderNav()
    expect(screen.getAllByRole('link', { name: 'Login' }).length).toBeGreaterThan(0)
  })
})
