import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Layout from './Layout'
import { setFocusMode } from '../utils/focusMode'

/**
 * Leaving focus mode must not take the app down.
 *
 * OPTIO-WEB-1P (2026-09-14): a Treehouse kiosk on Chrome OS. The facilitator
 * pressed "Exit fullscreen" and the ErrorBoundary rendered React #310,
 * "Rendered more hooks than during the previous render", because the focus
 * branch returned before the sidebar and site-settings hooks. The chrome the
 * exit was supposed to bring back never appeared.
 */

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, effectiveRole: 'student', logout: vi.fn() }),
}))
vi.mock('./navigation/Sidebar', () => ({ default: () => <nav>sidebar-stub</nav> }))
vi.mock('./navigation/TopNavbar', () => ({ default: () => <header>navbar-stub</header> }))
vi.mock('../hooks/useKioskIdleTimeout', () => ({ useKioskIdleTimeout: () => {} }))


const renderLayout = () => render(
  <MemoryRouter initialEntries={['/treehouse']}>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/treehouse" element={<div>page-content</div>} />
      </Route>
    </Routes>
  </MemoryRouter>,
)

describe('Layout — focus mode', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false }))
    setFocusMode(true, { homeRoute: '/treehouse', idleLoginRoute: '/treehouse-kiosk' })
  })
  afterEach(() => {
    setFocusMode(false)
    vi.restoreAllMocks()
  })

  it('hides the chrome while focus mode is on', () => {
    renderLayout()
    expect(screen.getByText('page-content')).toBeInTheDocument()
    expect(screen.queryByText('sidebar-stub')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument()
  })

  it('brings the chrome back on Exit fullscreen instead of crashing', async () => {
    // React reports the hook-order violation through console.error before it
    // throws; keep the test output clean and assert on the render instead.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderLayout()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }))
    })
    expect(screen.getByText('page-content')).toBeInTheDocument()
    expect(screen.getByText('sidebar-stub')).toBeInTheDocument()
    expect(screen.getByText('navbar-stub')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exit fullscreen' })).not.toBeInTheDocument()
  })
})
