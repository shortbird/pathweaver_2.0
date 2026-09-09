import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * A stale lazy chunk reaches the boundary, not the window.
 *
 * installChunkErrorRecovery listens on window 'error'/'unhandledrejection', but
 * React turns a rejected import() inside Suspense into a componentDidCatch — so
 * after a deploy the reader got the crash screen and stayed on it (Sentry
 * OPTIO-WEB-A/D: QuestDetail, RoleHome, ParentDashboardPage, AdvisorClassesPage,
 * all within hours of a release). The boundary has to recover it itself.
 */

const recoverFromChunkError = vi.fn(() => true)
const captureException = vi.fn()

vi.mock('../../utils/liveReload', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverFromChunkError: (...a) => recoverFromChunkError(...a),
}))
vi.mock('../../services/sentry', () => ({
  captureException: (...a) => captureException(...a),
  setSentryUser: vi.fn(),
  initSentry: vi.fn(),
}))
vi.mock('../../services/posthog', () => ({ captureError: vi.fn() }))

const ErrorBoundary = (await import('../ErrorBoundary')).default

const Boom = ({ message }) => { throw new Error(message) }

describe('ErrorBoundary chunk recovery', () => {
  let consoleError

  beforeEach(() => {
    recoverFromChunkError.mockClear()
    recoverFromChunkError.mockReturnValue(true)
    captureException.mockClear()
    // React logs the caught error itself; keep the test output readable.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => consoleError.mockRestore())

  it('reloads instead of reporting when a lazy chunk is stale', () => {
    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: https://x/QuestDetail-abc.js" />
      </ErrorBoundary>
    )
    expect(recoverFromChunkError).toHaveBeenCalledTimes(1)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports normally when the reload already happened', () => {
    // Debounced: the chunk is genuinely broken, so it must not be swallowed.
    recoverFromChunkError.mockReturnValue(false)
    render(
      <ErrorBoundary>
        <Boom message="Importing a module script failed." />
      </ErrorBoundary>
    )
    expect(recoverFromChunkError).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('leaves ordinary render errors alone', () => {
    render(
      <ErrorBoundary>
        <Boom message="Cannot read properties of undefined" />
      </ErrorBoundary>
    )
    expect(recoverFromChunkError).not.toHaveBeenCalled()
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
  })
})
