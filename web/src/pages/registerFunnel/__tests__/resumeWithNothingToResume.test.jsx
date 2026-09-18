import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import api from '../../../services/api'
import RegisterFunnelPage from '../../RegisterFunnelPage'

/**
 * /enroll/resume for someone with no registration to resume (Sentry
 * OPTIO-WEB-2B, 2026-09-17, ticket 2f304559).
 *
 * The page asks the server for the signed-in user's registration; a parent
 * who finished, or an admin who typed the URL, gets `registration: null` and
 * is sent to /. The load's `finally` still cleared the loading flag, so one
 * render happened between that and the navigation with no config at all,
 * and it read `config.organization` off null. The page must draw its spinner
 * in that gap, never the funnel.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('../../../services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual.default, get: vi.fn(), post: vi.fn() },
  }
})

const renderResume = () => render(
  <MemoryRouter initialEntries={['/enroll/resume']}>
    <Routes>
      <Route path="/enroll/resume" element={<RegisterFunnelPage />} />
    </Routes>
  </MemoryRouter>,
)

describe('/enroll/resume with nothing to resume', () => {
  let replace
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace, pathname: '/enroll/resume', search: '' },
    })
    api.get.mockImplementation((url) => {
      if (url === '/api/registration/my-registration') {
        return Promise.resolve({ data: { success: true, registration: null } })
      }
      return Promise.resolve({ data: {} })
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('sends the browser home and keeps the spinner up until it goes', async () => {
    const { container } = renderResume()
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    // The load has finished by now; the page must still not draw the funnel.
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByText('Registration unavailable')).toBeNull()
    expect(screen.queryByLabelText(/first name/i)).toBeNull()
  })
})
