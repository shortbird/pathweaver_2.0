/**
 * The page is part of an API failure's identity (September 2026).
 *
 * Grouped by endpoint alone, one Sentry issue was one URL and every bug that
 * ever hit it. OPTIO-WEB-3 (403 on /api/messages/conversations/:id) held a
 * parent-dashboard flood, an act-as re-mint race and a SIS inbox tab-switch
 * race at once, was "fixed" by three commits that were each right about their
 * own bug, and was marked resolved and regressed twice. The route the request
 * was made from is the call site, near enough, so it goes into the fingerprint
 * and the title, and the dedupe key follows.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosError } from 'axios'
import api, { currentPageShape } from './api'
import { captureException } from './sentry'

// vi.mock is hoisted above the imports by vitest, so these can sit below them.
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

const goTo = (path) => window.history.replaceState({}, '', path)

describe('API failures are grouped by page as well as endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    goTo('/')
    api.defaults.adapter = vi.fn(async (config) =>
      reject(config, 403, { error: 'You are not a participant in this conversation' })
    )
  })

  it('collapses ids in the page the same way it does in the endpoint', () => {
    goTo('/parent/dashboard/7d36356b-1026-4903-bb3a-79684946534f')
    expect(currentPageShape()).toBe('/parent/dashboard/:id')
    goTo('/quests/42/tasks')
    expect(currentPageShape()).toBe('/quests/:id/tasks')
  })

  it('names the page in the title and pins it in the fingerprint', async () => {
    goTo('/inbox')
    await expect(api.get('/api/messages/conversations/cf0f37eb-aa67-4590-b9ac-571d13991c27'))
      .rejects.toMatchObject({ response: { status: 403 } })
    expect(captureException).toHaveBeenCalledTimes(1)
    const [err, context] = captureException.mock.calls[0]
    expect(err.message).toBe('API 403: GET /api/messages/conversations/:id from /inbox')
    expect(context.fingerprint)
      .toEqual(['api-failure', '403', 'GET', '/api/messages/conversations/:id', '/inbox'])
    expect(context.tags).toEqual({ api_endpoint: '/api/messages/conversations/:id', page: '/inbox' })
    expect(context.server_message).toBe('You are not a participant in this conversation')
  })

  it('reports the same endpoint again from a different page -- a different bug', async () => {
    goTo('/inbox')
    await expect(api.get('/api/messages/conversations/one-thread')).rejects.toBeTruthy()
    goTo('/parent/dashboard')
    await expect(api.get('/api/messages/conversations/one-thread')).rejects.toBeTruthy()
    expect(captureException).toHaveBeenCalledTimes(2)
    const fingerprints = captureException.mock.calls.map(([, c]) => c.fingerprint)
    expect(fingerprints[0]).not.toEqual(fingerprints[1])
  })

  it('still reports a repeat on the same page only once', async () => {
    // The dedupe set lives for the page load, so this case uses a path the
    // cases above have not already reported.
    goTo('/inbox')
    await expect(api.get('/api/messages/conversations/another-thread')).rejects.toBeTruthy()
    await expect(api.get('/api/messages/conversations/another-thread')).rejects.toBeTruthy()
    expect(captureException).toHaveBeenCalledTimes(1)
  })
})
