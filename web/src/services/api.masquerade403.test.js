/**
 * The API-failure reporter during a masquerade (September 2026).
 *
 * Sentry 07b05221, "API 403: GET /api/sis/roster from /people after View as
 * student", with five siblings (households, members, users/:id,
 * unassigned-students, removal-preview). An org admin pressed "View as
 * student" on the SIS People page; the session became the student's, and the
 * page kept refetching until the navigation landed. The backend refused the
 * student, correctly. A 403 while a masquerade is running or starting is the
 * target's own access, not an over-tightened check, so it is not reported.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { AxiosError } from 'axios'
import api from './api'
import { captureException } from './sentry'
import { beginMasqueradeTransition, resetMasqueradeGate } from './masqueradeGate'

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../utils/browserDetection', () => ({
  shouldUseAuthHeaders: () => false
}))

vi.mock('./sentry', () => ({
  captureException: vi.fn()
}))

const reject = (config, status, data) => {
  throw new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    { status, statusText: String(status), headers: {}, config, data }
  )
}

describe('403 reporting and masquerade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetMasqueradeGate()
    api.defaults.adapter = vi.fn(async (config) =>
      reject(config, 403, { error: 'Access denied' })
    )
  })

  afterEach(() => {
    localStorage.clear()
    resetMasqueradeGate()
  })

  it('still reports a 403 when nobody is masquerading', async () => {
    await expect(api.get('/api/sis/roster-plain')).rejects.toMatchObject({
      response: { status: 403 }
    })
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException.mock.calls[0][0].message)
      .toBe('API 403: GET /api/sis/roster-plain from /')
  })

  it('stays quiet while a masquerade is starting (View as student)', async () => {
    beginMasqueradeTransition()
    await expect(api.get('/api/sis/roster')).rejects.toMatchObject({
      response: { status: 403 }
    })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('stays quiet while a masquerade is active', async () => {
    localStorage.setItem('masquerade_state', JSON.stringify({ is_masquerading: true }))
    await expect(api.get('/api/sis/households')).rejects.toMatchObject({
      response: { status: 403 }
    })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('still reports a 500 during a masquerade', async () => {
    localStorage.setItem('masquerade_state', JSON.stringify({ is_masquerading: true }))
    api.defaults.adapter = vi.fn(async (config) => reject(config, 500, { error: 'boom' }))
    await expect(api.get('/api/sis/members')).rejects.toMatchObject({
      response: { status: 500 }
    })
    expect(captureException).toHaveBeenCalledTimes(1)
  })
})
