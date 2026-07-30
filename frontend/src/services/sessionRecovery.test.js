/**
 * Session recovery helpers (July 2026) — "logged out when I close the app".
 *
 * The access cookie lives 15 minutes, the refresh cookie 30 days. So every
 * return visit after a break starts with a 401 and depends entirely on the
 * refresh POST. The old interceptor treated any failure of that POST as
 * "session over": it cleared tokens and hard-redirected to /login, throwing
 * away a refresh cookie the backend would still have honoured for weeks.
 *
 * These tests pin the two rules that stop that:
 *   1. transient failures get one retry
 *   2. only a 401/403 from /api/auth/refresh ends the session
 */
import { describe, it, expect, vi } from 'vitest'
import { postRefreshWithRetry, isUnrecoverableAuthFailure } from './sessionRecovery'

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), {
  response: { status }
})
// No `response` at all is what axios gives us for a network error or a timeout.
const networkError = () => new Error('Network Error')

const noSleep = () => Promise.resolve()

describe('postRefreshWithRetry', () => {
  it('returns the first response when refresh succeeds', async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, data: {} })
    const res = await postRefreshWithRetry({}, { post, sleep: noSleep })
    expect(res.status).toBe(200)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('retries once and succeeds after a cold-start 502', async () => {
    const post = vi.fn()
      .mockRejectedValueOnce(httpError(502))
      .mockResolvedValueOnce({ status: 200, data: { access_token: 'a' } })
    const res = await postRefreshWithRetry({}, { post, sleep: noSleep })
    expect(res.data.access_token).toBe('a')
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('retries once after a network error / timeout', async () => {
    const post = vi.fn()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ status: 200, data: {} })
    await postRefreshWithRetry({}, { post, sleep: noSleep })
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a 401 — a rejected refresh token is a real answer', async () => {
    const post = vi.fn().mockRejectedValue(httpError(401))
    await expect(postRefreshWithRetry({}, { post, sleep: noSleep })).rejects.toMatchObject({
      response: { status: 401 }
    })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('forwards the request body (Safari/iOS header-mode refresh token)', async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, data: {} })
    await postRefreshWithRetry({ refresh_token: 'rt' }, { post, sleep: noSleep })
    expect(post).toHaveBeenCalledWith('/api/auth/refresh', { refresh_token: 'rt' })
  })

  it('propagates the second failure when both attempts fail', async () => {
    const post = vi.fn().mockRejectedValue(httpError(503))
    await expect(postRefreshWithRetry({}, { post, sleep: noSleep })).rejects.toMatchObject({
      response: { status: 503 }
    })
    expect(post).toHaveBeenCalledTimes(2)
  })
})

describe('isUnrecoverableAuthFailure', () => {
  it.each([401, 403])('treats %i as a genuine end of session', (status) => {
    expect(isUnrecoverableAuthFailure(httpError(status))).toBe(true)
  })

  it.each([500, 502, 503, 504])('keeps the session on a %i (Render cold start)', (status) => {
    expect(isUnrecoverableAuthFailure(httpError(status))).toBe(false)
  })

  it('keeps the session on a 429 — one school NAT is one IP', () => {
    // The refresh endpoint throttles per IP (300/5min). A computer lab behind a
    // single NAT can trip it with entirely legitimate traffic; logging the whole
    // classroom out over it is exactly the reported symptom.
    expect(isUnrecoverableAuthFailure(httpError(429))).toBe(false)
  })

  it('keeps the session on a network error or timeout', () => {
    expect(isUnrecoverableAuthFailure(networkError())).toBe(false)
  })

  it('keeps the session on an undefined/blank error', () => {
    expect(isUnrecoverableAuthFailure(undefined)).toBe(false)
    expect(isUnrecoverableAuthFailure(null)).toBe(false)
  })

  it('ends the session for an explicit __sessionOver marker', () => {
    // Raised when refresh returned a non-200 with no usable tokens: we did get
    // an answer, it just wasn't a session, so retrying forever is pointless.
    expect(isUnrecoverableAuthFailure(
      Object.assign(new Error('Token refresh failed'), { __sessionOver: true })
    )).toBe(true)
  })
})
