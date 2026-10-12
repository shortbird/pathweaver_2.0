/**
 * AI switched off for the learner is a product state, not a fault.
 *
 * Sentry 64448412 + e7429a56: web 403 "ai_disabled" on
 * POST /api/quests/:id/generate-tasks and /analyze-manual-task. A parent was
 * acting for a dependent child whose AI is off (backend utils/ai_access.py).
 * The refusal is correct; reporting it to Sentry was noise. Any OTHER 403 is
 * still reported -- that is what the 403 reporting exists for.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosError } from 'axios'
import api from './api'
import { captureException } from './sentry'

vi.mock('../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))
vi.mock('../utils/browserDetection', () => ({ shouldUseAuthHeaders: () => false }))
// vi.mock is hoisted above the imports.
vi.mock('./sentry', () => ({ captureException: vi.fn() }))

const respond = (status, data) => {
  api.defaults.adapter = vi.fn(async (config) => {
    throw new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      { status, statusText: String(status), headers: {}, config, data }
    )
  })
}

// The adapter also answers the CSRF-token fetch a POST makes first, so the
// assertions look for the request under test by its title.
const reported = () => captureException.mock.calls.map((c) => c[0].message)

describe('AI-disabled 403s are not reported', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['DEPENDENT_AI_DISABLED', 'ai_disabled', '/api/quests/q1/generate-tasks'],
    ['DEPENDENT_AI_FEATURE_DISABLED', 'ai_feature_disabled', '/api/quests/q2/analyze-manual-task'],
    ['ORG_AI_DISABLED', 'ai_disabled_org', '/api/quests/q3/generate-tasks'],
    ['ORG_AI_FEATURE_DISABLED', 'ai_feature_disabled_org', '/api/quests/q4/analyze-manual-task'],
  ])('%s stays out of Sentry', async (code, error, url) => {
    respond(403, { error, code, message: 'Ask your parent to enable them in their dashboard.' })
    await expect(api.post(url, {})).rejects.toMatchObject({ response: { status: 403 } })
    expect(reported().filter((m) => m.includes(url))).toEqual([])
  })

  it('still reports any other 403', async () => {
    respond(403, { error: 'Access denied', code: 'FORBIDDEN' })
    await expect(api.post('/api/quests/q5/other', {})).rejects.toMatchObject({ response: { status: 403 } })
    expect(reported()).toContain('API 403: POST /api/quests/q5/other from /')
  })

  it('still reports a 500 that happens to carry an AI code', async () => {
    respond(500, { error: 'boom', code: 'DEPENDENT_AI_DISABLED' })
    await expect(api.post('/api/quests/q6/generate-tasks', {})).rejects.toMatchObject({ response: { status: 500 } })
    expect(reported()).toContain('API 500: POST /api/quests/q6/generate-tasks from /')
  })
})
