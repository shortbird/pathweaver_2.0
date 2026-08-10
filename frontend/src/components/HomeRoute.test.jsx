import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import HomeRoute, { NotFoundRedirect } from './HomeRoute'

let authState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

// The real marketing homepage drags in layout and analytics; a stub is enough
// to prove which branch rendered.
vi.mock('../pages/marketing/HomePage', () => ({
  default: () => <div data-testid="marketing-home">Marketing homepage</div>
}))

const writeLogin = (userId) =>
  localStorage.setItem('session_sync', JSON.stringify({ userId, action: 'login', timestamp: 1 }))

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/dashboard" element={<div data-testid="student-dashboard" />} />
        <Route path="/parent/dashboard" element={<div data-testid="parent-dashboard" />} />
        <Route path="/showcase" element={<div data-testid="showcase" />} />
        <Route path="/school" element={<div data-testid="school-home" />} />
        <Route path="*" element={<NotFoundRedirect />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('HomeRoute (the / route)', () => {
  beforeEach(() => {
    localStorage.clear()
    authState = { isAuthenticated: false, user: null, loading: false }
  })

  it('shows the marketing homepage to anonymous visitors', () => {
    renderAt('/')
    expect(screen.getByTestId('marketing-home')).toBeInTheDocument()
  })

  it('renders marketing immediately while auth loads with no session hint (crawlers, fresh visitors)', () => {
    authState = { isAuthenticated: false, user: null, loading: true }
    renderAt('/')
    expect(screen.getByTestId('marketing-home')).toBeInTheDocument()
  })

  it('holds with a loader instead of flashing marketing while a probable session resolves', () => {
    writeLogin('u1')
    authState = { isAuthenticated: false, user: null, loading: true }
    renderAt('/')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByTestId('marketing-home')).not.toBeInTheDocument()
  })

  it('forwards a signed-in student to the dashboard', () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'student' } }
    renderAt('/')
    expect(screen.getByTestId('student-dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('marketing-home')).not.toBeInTheDocument()
  })

  it('forwards a signed-in parent to the parent dashboard', () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'parent' } }
    renderAt('/')
    expect(screen.getByTestId('parent-dashboard')).toBeInTheDocument()
  })

  it('forwards showcase-only marketing accounts to the showcase', () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'student', can_view_showcase: true } }
    renderAt('/')
    expect(screen.getByTestId('showcase')).toBeInTheDocument()
  })

  it('forwards families of a homepage school to the school page', () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'parent', school: { id: 'o', homepage: true } } }
    renderAt('/')
    expect(screen.getByTestId('school-home')).toBeInTheDocument()
  })
})

describe('NotFoundRedirect (unknown paths)', () => {
  beforeEach(() => {
    localStorage.clear()
    authState = { isAuthenticated: false, user: null, loading: false }
  })

  it('sends a signed-in user to their app home, not the marketing homepage', () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'student' } }
    renderAt('/some/removed/page')
    expect(screen.getByTestId('student-dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('marketing-home')).not.toBeInTheDocument()
  })

  it('keeps sending anonymous visitors to the homepage', () => {
    renderAt('/some/removed/page')
    expect(screen.getByTestId('marketing-home')).toBeInTheDocument()
  })

  it('waits for a probable session instead of guessing', () => {
    writeLogin('u1')
    authState = { isAuthenticated: false, user: null, loading: true }
    renderAt('/some/removed/page')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('redirects home without waiting when there is no session hint', () => {
    authState = { isAuthenticated: false, user: null, loading: true }
    renderAt('/some/removed/page')
    expect(screen.getByTestId('marketing-home')).toBeInTheDocument()
  })
})
