/**
 * The `expect403` opt-out in the API-failure reporter (September 2026).
 *
 * A 403 is reported because role-gated UI means legitimate users rarely see
 * one, so a burst of them reads as an over-tightened authz check. That holds
 * right up until a caller PROBES an endpoint on purpose — asks a question whose
 * honest answer may be "not yours" — and handles the refusal itself.
 *
 * The diploma probe is the case that forced this: every student overview asks
 * the OEA credits endpoint whether this student has a Hearthwood diploma, and
 * for every student outside Hearthwood the answer arrives as a 403 the caller
 * already falls back from. Those were landing in Sentry as errors, one per
 * (viewer, student) pair (OPTIO-WEB-R), burying the real 403s they exist to
 * surface.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

vi.mock('../utils/browserDetection', () => ({
  shouldUseAuthHeaders: () => false
}))

vi.mock('./sentry', () => ({
  captureException: vi.fn()
}))

import axios from 'axios'
import api, { oeaAPI } from './api'
import { captureException } from './sentry'

const reject = (config, status, data) => {
  throw new axios.AxiosError(
    `Request failed with status code ${status}`,
    axios.AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    { status, statusText: String(status), headers: {}, config, data }
  )
}

describe('expect403 opt-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.defaults.adapter = vi.fn(async (config) =>
      reject(config, 403, { error: 'Access denied' })
    )
  })

  it('reports a 403 the caller did not ask for', async () => {
    await expect(api.get('/api/plain-403')).rejects.toMatchObject({
      response: { status: 403 }
    })
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException.mock.calls[0][0].message)
      .toBe('API 403: GET /api/plain-403')
  })

  it('stays quiet for a request that declared the 403 expected', async () => {
    await expect(
      api.get('/api/probe-403', { expect403: true })
    ).rejects.toMatchObject({ response: { status: 403 } })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('still reports a 500 on a request that only excused the 403', async () => {
    api.defaults.adapter = vi.fn(async (config) =>
      reject(config, 500, { error: 'boom' })
    )
    await expect(
      api.get('/api/probe-500', { expect403: true })
    ).rejects.toMatchObject({ response: { status: 500 } })
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException.mock.calls[0][0].message)
      .toBe('API 500: GET /api/probe-500')
  })

  it('sends the opt-out on the diploma probe and not on a direct credits read',
    async () => {
      const seen = []
      api.defaults.adapter = vi.fn(async (config) => {
        seen.push(config)
        reject(config, 403, { error: 'You do not manage this student' })
      })

      const probed = '9a2f4eea-c8c9-440e-8221-bc646369359b'
      const read = 'b4c15895-1701-48fa-b1d7-6b3ff5b059ce'
      await expect(oeaAPI.credits(probed, { expect403: true }))
        .rejects.toMatchObject({ response: { status: 403 } })
      await expect(oeaAPI.credits(read))
        .rejects.toMatchObject({ response: { status: 403 } })

      expect(seen[0].expect403).toBe(true)
      expect(seen[1].expect403).toBeUndefined()
      // Only the un-excused read is reported.
      expect(captureException).toHaveBeenCalledTimes(1)
      expect(captureException.mock.calls[0][0].message)
        .toBe('API 403: GET /api/oea/students/:id/credits')
    })
})
