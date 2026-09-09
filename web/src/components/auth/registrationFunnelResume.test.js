import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  default: { post: vi.fn() }
}))

import api from '../../services/api'
import { resumePendingRegistrationFunnel } from './registrationFunnelResume'
import { PENDING_CODE_KEYS } from './oauthPendingCodes'

/**
 * The OAuth half of the parent registration funnel.
 *
 * A parent whose account has no password — every Google/Apple signup, plus the
 * org-imported ones — cannot sign into the funnel with an email and password
 * because there is none to give. Carolyn Waite (Apple, 2026-08-25) hit a closed
 * loop: "Create account" said her email was taken, "Sign in" said her password
 * was wrong. The provider button parks the invitation code across the redirect;
 * this is what spends it on the way back.
 */
describe('resumePendingRegistrationFunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('returns null and calls nothing when no funnel is pending', async () => {
    expect(await resumePendingRegistrationFunnel()).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('attaches the account and resumes the funnel', async () => {
    localStorage.setItem(PENDING_CODE_KEYS.registrationCode, 'optio-academy')
    api.post.mockResolvedValue({ data: { success: true, status: 'family' } })

    expect(await resumePendingRegistrationFunnel()).toBe('/enroll/resume')
    expect(api.post).toHaveBeenCalledWith('/api/registration/attach', { code: 'optio-academy' })
  })

  it('spends the code so an unrelated later sign-in cannot re-fire the attach', async () => {
    localStorage.setItem(PENDING_CODE_KEYS.registrationCode, 'optio-academy')
    api.post.mockResolvedValue({ data: { success: true } })

    await resumePendingRegistrationFunnel()
    expect(localStorage.getItem(PENDING_CODE_KEYS.registrationCode)).toBeNull()
    expect(await resumePendingRegistrationFunnel()).toBeNull()
  })

  it('clears the code even when the attach fails', async () => {
    localStorage.setItem(PENDING_CODE_KEYS.registrationCode, 'optio-academy')
    api.post.mockRejectedValue({ response: { data: { error: 'nope' } } })

    await resumePendingRegistrationFunnel()
    expect(localStorage.getItem(PENDING_CODE_KEYS.registrationCode)).toBeNull()
  })

  it('returns a refused parent to the funnel carrying the reason', async () => {
    localStorage.setItem(PENDING_CODE_KEYS.registrationCode, 'optio-academy')
    api.post.mockRejectedValue({
      response: { data: { error: 'This account belongs to another school. Please contact Optio Academy.' } }
    })

    const path = await resumePendingRegistrationFunnel()
    expect(path.startsWith('/enroll/optio-academy?attach_error=')).toBe(true)
    // The funnel reads this back into its account-step notice, so it has to
    // survive the round trip intact.
    const reason = new URLSearchParams(path.split('?')[1]).get('attach_error')
    expect(reason).toBe('This account belongs to another school. Please contact Optio Academy.')
  })

  it('falls back to the plain funnel URL when the failure carries no message', async () => {
    localStorage.setItem(PENDING_CODE_KEYS.registrationCode, 'optio-academy')
    api.post.mockRejectedValue(new Error('Network Error'))

    expect(await resumePendingRegistrationFunnel()).toBe('/enroll/optio-academy')
  })
})
