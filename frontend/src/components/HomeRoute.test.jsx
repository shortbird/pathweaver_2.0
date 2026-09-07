import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import HomeRoute, { NotFoundRedirect } from './HomeRoute'
import { PROD_MARKETING_URL } from '../utils/marketingUrl'

let authState = {}
let replaceSpy

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

const writeLogin = (userId) =>
  localStorage.setItem('session_sync', JSON.stringify({ userId, action: 'login', timestamp: 1 }))

/** Pretend the page is an installed PWA (or not). */
function setStandalone(on) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: on })
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<div data-testid="login" />} />
        <Route path="/dashboard" element={<div data-testid="student-dashboard" />} />
        <Route path="*" element={<NotFoundRedirect />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  authState = { isAuthenticated: false, user: null, loading: false }
  setStandalone(false)
  replaceSpy = vi.fn()
  // jsdom's location is not writable; swap in a stub we can assert on.
  Object.defineProperty(window, 'location', {
    value: { replace: replaceSpy, href: 'http://localhost:3000/' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HomeRoute (the / route)', () => {
  it('sends anonymous visitors to the marketing homepage on www', async () => {
    renderAt('/')
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith(`${PROD_MARKETING_URL}/`))
  })

  it('leaves this host entirely — never renders a local homepage copy', async () => {
    renderAt('/')
    await waitFor(() => expect(replaceSpy).toHaveBeenCalled())
    const target = replaceSpy.mock.calls[0][0]
    expect(target).toMatch(/^https:\/\/www\.optioeducation\.com/)
  })

  /**
   * The PWA's start_url is this path. Redirecting would drop a logged-out user
   * out of the installed app and into a browser, with no way back short of
   * reinstalling.
   */
  it('keeps an installed PWA in the app shell, on /login', async () => {
    setStandalone(true)
    renderAt('/')
    expect(await screen.findByTestId('login')).toBeInTheDocument()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('forwards a signed-in student to their dashboard, never off-site', async () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'student' } }
    renderAt('/')
    expect(await screen.findByTestId('student-dashboard')).toBeInTheDocument()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  /**
   * The regression that matters. Guessing "anonymous" from a missing session
   * hint used to be free — the signed-in branch took over when auth resolved.
   * A cross-origin redirect cannot be taken back, so we wait.
   */
  it('waits for the session check rather than redirecting mid-flight', () => {
    authState = { isAuthenticated: false, user: null, loading: true }
    renderAt('/')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('waits even when a session hint is present', () => {
    writeLogin('u1')
    authState = { isAuthenticated: false, user: null, loading: true }
    renderAt('/')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})

describe('NotFoundRedirect (unknown paths)', () => {
  it('sends a signed-in user to their app home, not off-site', async () => {
    authState = { isAuthenticated: true, loading: false, user: { id: 'u1', role: 'student' } }
    renderAt('/some/removed/page')
    expect(await screen.findByTestId('student-dashboard')).toBeInTheDocument()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('routes anonymous visitors via / , which forwards them to www', async () => {
    renderAt('/some/removed/page')
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith(`${PROD_MARKETING_URL}/`))
  })

  it('waits for a probable session instead of guessing', () => {
    writeLogin('u1')
    authState = { isAuthenticated: false, user: null, loading: true }
    renderAt('/some/removed/page')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
